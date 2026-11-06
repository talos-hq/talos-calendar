"""
Pure slot computation and reminder due times (no I/O).

All datetimes passed in and returned are timezone-aware. Any object with the
fields of Schedule works; relaxed() also needs it to be a dataclass.
"""

import dataclasses
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Protocol, TypeVar, cast
from zoneinfo import ZoneInfo

UTC = timezone.utc

INDEFINITE_DAYS = 365  # horizon cap for date_range_kind 'indefinite'

Interval = tuple[datetime, datetime]
Windows = Sequence[tuple[str, str]]


class Schedule(Protocol):
    """What the slot engine reads from a meeting type."""

    @property
    def tz(self) -> str: ...
    @property
    def duration_min(self) -> int: ...
    @property
    def increment_min(self) -> int: ...
    @property
    def min_notice_min(self) -> int: ...
    @property
    def max_days_ahead(self) -> int: ...
    @property
    def buffer_before_min(self) -> int: ...
    @property
    def buffer_after_min(self) -> int: ...
    @property
    def max_per_day(self) -> int: ...
    @property
    def max_per_week(self) -> int: ...
    @property
    def date_range_kind(self) -> str: ...
    @property
    def range_start(self) -> str: ...
    @property
    def range_end(self) -> str: ...
    @property
    def weekly_hours(self) -> Mapping[int, list[tuple[str, str]]]: ...
    @property
    def date_overrides(self) -> Mapping[str, list[tuple[str, str]]]: ...


S = TypeVar("S", bound=Schedule)


def to_iso(dt: datetime) -> str:
    """UTC ISO-8601 with a Z suffix, second precision."""
    return dt.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> datetime:
    """Parses an ISO-8601 instant (Z or offset) into an aware UTC datetime."""
    text = value.strip()
    if text.endswith("Z") or text.endswith("z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        raise ValueError(f"Instant must include a timezone: {value}")
    return dt.astimezone(UTC)


def _hm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def _local(day: date, at: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, at, tzinfo=tz)


def _wall_utc(day: date, at: time, tz: ZoneInfo) -> datetime:
    """The UTC instant of local wall time `at` on `day`, DST-safe.

    A wall time inside a spring-forward gap does not exist; it maps to the first
    instant after the gap (the round trip back to local time would differ). An
    ambiguous fall-back time takes its first (daylight) occurrence.
    """
    local = _local(day, at, tz)
    wall = local.replace(tzinfo=None)
    utc = local.astimezone(UTC)
    if utc.astimezone(tz).replace(tzinfo=None) != wall:
        # In the gap fold=0 lands past it by the gap's length: walk back to its end.
        while (utc - timedelta(minutes=1)).astimezone(tz).replace(tzinfo=None) >= wall:
            utc -= timedelta(minutes=1)
    return utc


def _overlaps(start: datetime, end: datetime, busy: Iterable[Interval]) -> bool:
    return any(b_start < end and b_end > start for b_start, b_end in busy)


def busy_window(event_type: Schedule, start: datetime) -> Interval:
    """Time a booking at `start` blocks, including its before/after buffers."""
    return (
        start - timedelta(minutes=event_type.buffer_before_min),
        start
        + timedelta(minutes=event_type.duration_min + event_type.buffer_after_min),
    )


def _local_day(value: str) -> date | None:
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def horizon_end(event_type: Schedule, now: datetime) -> datetime:
    """Latest bookable start instant for event_type.

    rolling: now + max_days_ahead days; indefinite: now + INDEFINITE_DAYS;
    fixed: end of range_end (local), capped at now + INDEFINITE_DAYS, and
    `now` when the range is empty or invalid.
    """
    if event_type.date_range_kind == "indefinite":
        return now + timedelta(days=INDEFINITE_DAYS)
    if event_type.date_range_kind == "fixed":
        start = _local_day(event_type.range_start)
        end = _local_day(event_type.range_end)
        if start is None or end is None or end < start:
            return now
        tz = ZoneInfo(event_type.tz)
        end_dt = _local(end + timedelta(days=1), time(0, 0), tz).astimezone(UTC)
        return max(now, min(end_dt, now + timedelta(days=INDEFINITE_DAYS)))
    return now + timedelta(days=event_type.max_days_ahead)


# Hours the owner and invitees holding a one-time code may book in, every day of
# the week, in the meeting's own time zone.
RELAXED_WINDOW = ("06:00", "22:00")


def relaxed(event_type: S) -> S:
    """event_type with the public schedule lifted, for the owner and code holders.

    Every day is also open over RELAXED_WINDOW, closed dates are reopened, and there
    is no minimum notice, so today is bookable. The meeting's own intervals stay as
    they are, next to the window: their start times keep their own grid, so every
    time the public list offers is still offered (and accepted), and a wider own
    interval is not cut back. What is left for available_slots to apply: existing
    bookings, buffers, calendar busy time, the per-day and per-week limits and the
    date range.
    """
    window = RELAXED_WINDOW
    return dataclasses.replace(
        cast(Any, event_type),
        weekly_hours={
            day: [*event_type.weekly_hours.get(day, []), window] for day in range(7)
        },
        date_overrides={
            day: [*intervals, window]
            for day, intervals in event_type.date_overrides.items()
        },
        min_notice_min=0,
    )


def _week_count(counts: dict[date, int], day: date) -> int:
    monday = day - timedelta(days=day.weekday())
    return sum(counts.get(monday + timedelta(days=i), 0) for i in range(7))


def available_slots(
    event_type: Schedule,
    now: datetime,
    busy: Sequence[Interval],
    day_counts: dict[date, int] | None = None,
    blocked: Sequence[Interval] = (),
) -> list[datetime]:
    """Returns bookable UTC start instants for event_type.

    `busy` must stay clear of the new meeting's buffered window; `blocked` (other
    bookings' own buffered windows) only of the meeting itself.

    Hours come from date_overrides (per local date, [] closes the day) or else
    weekly_hours. A start is kept when it lies within [now + notice, now +
    horizon], its buffered window avoids busy, and the local day is under
    max_per_day and its ISO week (Mon-Sun) under max_per_week (0 = unlimited)
    according to day_counts. The horizon follows date_range_kind (see
    horizon_end); 'fixed' also limits days to [range_start, range_end].
    """
    tz = ZoneInfo(event_type.tz)
    counts = day_counts or {}
    duration = timedelta(minutes=event_type.duration_min)
    step = timedelta(minutes=event_type.increment_min)
    earliest = now + timedelta(minutes=event_type.min_notice_min)
    latest = horizon_end(event_type, now)

    out: set[datetime] = set()
    day = earliest.astimezone(tz).date()
    last_day = latest.astimezone(tz).date()
    if event_type.date_range_kind == "fixed":
        range_start = _local_day(event_type.range_start)
        range_end = _local_day(event_type.range_end)
        if range_start is None or range_end is None or range_end < range_start:
            return []
        day = max(day, range_start)
        last_day = min(last_day, range_end)
    while day <= last_day:
        full = (
            event_type.max_per_day > 0 and counts.get(day, 0) >= event_type.max_per_day
        ) or (
            event_type.max_per_week > 0
            and _week_count(counts, day) >= event_type.max_per_week
        )
        if full:
            day += timedelta(days=1)
            continue
        key = day.isoformat()
        if key in event_type.date_overrides:
            intervals = event_type.date_overrides[key]
        else:
            intervals = event_type.weekly_hours.get(day.weekday(), [])
        for start_str, end_str in intervals:
            window_start = _wall_utc(day, _hm(start_str), tz)
            window_end = _wall_utc(day, _hm(end_str), tz)
            t = window_start
            while t + duration <= window_end:
                if earliest <= t <= latest:
                    b_start, b_end = busy_window(event_type, t)
                    if not _overlaps(b_start, b_end, busy) and not _overlaps(
                        t, t + duration, blocked
                    ):
                        out.add(t)  # a set of UTC instants: no fall-back duplicates
                t += step
        day += timedelta(days=1)
    return sorted(out)


def reminder_due_times(start: datetime, tz: ZoneInfo) -> dict[str, datetime]:
    local = start.astimezone(tz)
    return {
        "night_before": _local(
            local.date() - timedelta(days=1), time(20, 0), tz
        ).astimezone(UTC),
        "morning_of": _local(local.date(), time(8, 30), tz).astimezone(UTC),
        "1h": (start - timedelta(minutes=60)).astimezone(UTC),
        "15m": (start - timedelta(minutes=15)).astimezone(UTC),
    }
