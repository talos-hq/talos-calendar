"""Run with: PYTHONPATH=python python3 -m unittest discover -s test -p 'test_*.py'"""

import dataclasses
import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from talos_calendar import slots

UTC = timezone.utc
NY = ZoneInfo("America/New_York")


@dataclasses.dataclass(frozen=True)
class Meeting:
    tz: str = "America/New_York"
    duration_min: int = 60
    increment_min: int = 60
    min_notice_min: int = 0
    max_days_ahead: int = 30
    buffer_before_min: int = 0
    buffer_after_min: int = 0
    max_per_day: int = 0
    max_per_week: int = 0
    date_range_kind: str = "rolling"
    range_start: str = ""
    range_end: str = ""
    weekly_hours: dict = dataclasses.field(
        default_factory=lambda: {d: [("10:00", "12:00")] for d in range(7)}
    )
    date_overrides: dict = dataclasses.field(default_factory=dict)


NOW = datetime(2026, 7, 1, 0, 0, tzinfo=UTC)


class Slots(unittest.TestCase):
    def test_hours_are_local_to_the_meeting_zone(self) -> None:
        first = slots.available_slots(Meeting(), NOW, [])[0]
        self.assertEqual((10, 0), (first.astimezone(NY).hour, first.astimezone(NY).minute))
        self.assertEqual(14, first.hour)

    def test_local_hours_hold_across_daylight_saving(self) -> None:
        now = datetime(2026, 3, 7, 0, 0, tzinfo=UTC)
        found = slots.available_slots(Meeting(), now, [])
        self.assertEqual({10, 11}, {s.astimezone(NY).hour for s in found})
        self.assertEqual({14, 15, 16}, {s.hour for s in found})

    def test_spring_gap_maps_to_the_first_instant_after_it(self) -> None:
        got = slots._wall_utc(
            datetime(2026, 3, 8).date(), datetime(2026, 1, 1, 2, 30).time(), NY
        )
        self.assertEqual(datetime(2026, 3, 8, 7, 0, tzinfo=UTC), got)

    def test_fall_back_has_no_duplicates(self) -> None:
        meeting = Meeting(weekly_hours={d: [("00:00", "04:00")] for d in range(7)})
        found = slots.available_slots(meeting, datetime(2026, 10, 31, tzinfo=UTC), [])
        self.assertEqual(len(found), len(set(found)))

    def test_busy_respects_buffers_and_blocked_does_not(self) -> None:
        meeting = Meeting(buffer_after_min=60)
        start = slots.available_slots(meeting, NOW, [])[0]
        clash = (start + timedelta(minutes=60), start + timedelta(minutes=70))
        self.assertNotIn(start, slots.available_slots(meeting, NOW, [clash]))
        self.assertIn(start, slots.available_slots(meeting, NOW, [], blocked=[clash]))

    def test_override_closes_a_day(self) -> None:
        day = slots.available_slots(Meeting(), NOW, [])[0].astimezone(NY).date()
        meeting = Meeting(date_overrides={day.isoformat(): []})
        self.assertFalse(
            [s for s in slots.available_slots(meeting, NOW, []) if s.astimezone(NY).date() == day]
        )

    def test_invalid_fixed_range_offers_nothing(self) -> None:
        meeting = Meeting(date_range_kind="fixed", range_start="bad", range_end="2026-07-02")
        self.assertEqual([], slots.available_slots(meeting, NOW, []))

    def test_relaxed_lifts_the_public_schedule(self) -> None:
        meeting = Meeting(min_notice_min=720)
        open_up = slots.relaxed(meeting)
        self.assertIsInstance(open_up, Meeting)
        self.assertEqual(0, open_up.min_notice_min)
        self.assertIn(slots.RELAXED_WINDOW, open_up.weekly_hours[0])

    def test_reminders_use_the_given_zone(self) -> None:
        due = slots.reminder_due_times(datetime(2026, 7, 2, 18, 0, tzinfo=UTC), NY)
        self.assertEqual(datetime(2026, 7, 2, 12, 30, tzinfo=UTC), due["morning_of"])
        self.assertEqual(datetime(2026, 7, 2, 0, 0, tzinfo=UTC), due["night_before"])
        self.assertEqual(datetime(2026, 7, 2, 17, 0, tzinfo=UTC), due["1h"])

    def test_iso_round_trip_and_naive_refusal(self) -> None:
        self.assertEqual("2026-07-01T00:00:00Z", slots.to_iso(slots.parse_iso("2026-06-30T20:00:00-04:00")))
        with self.assertRaises(ValueError):
            slots.parse_iso("2026-07-01T00:00:00")


if __name__ == "__main__":
    unittest.main()
