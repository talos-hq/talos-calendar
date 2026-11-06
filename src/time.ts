// Time zone selection and formatting. The API speaks UTC only.

const TZ_KEY = "booking.tz";

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function browserTz(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz && isValidTz(tz) ? tz : "UTC";
}

export function loadTz(): string {
  try {
    const saved = localStorage.getItem(TZ_KEY);
    if (saved && isValidTz(saved)) return saved;
  } catch {
    // storage unavailable
  }
  return browserTz();
}

export function saveTz(tz: string): void {
  try {
    localStorage.setItem(TZ_KEY, tz);
  } catch {
    // storage unavailable
  }
}

export function timezoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dayKey(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function groupByDay(slots: string[], tz: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const slot of slots) {
    const key = dayKey(slot, tz);
    const list = groups.get(key);
    if (list) list.push(slot);
    else groups.set(key, [slot]);
  }
  return groups;
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "Tuesday, September 15" for a YYYY-MM-DD key. */
export function formatDayKey(key: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${key}T12:00:00Z`));
}

export function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month, 15)),
  );
}

/** Zone abbreviation; "GMT+2"-style names get the IANA zone appended so they stay unambiguous. */
function zoneLabel(parts: Intl.DateTimeFormatPart[], tz: string): string {
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return /^(GMT|UTC)[+\u2212-]/.test(name) ? `${name} (${tz.replace(/_/g, " ")})` : name;
}

/** "Tue, Sep 15, 2026, 10:00 AM PDT" */
export function formatWhen(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  return parts.map((p) => (p.type === "timeZoneName" ? zoneLabel(parts, tz) : p.value)).join("");
}

/** Whether two zones read the same clock at an instant; aliases like US/Pacific and America/Los_Angeles do. */
export function sameClock(iso: string, a: string, b: string): boolean {
  const read = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  return read(a) === read(b);
}

/** "10:30 AM PDT" in a zone (hold-until times). */
export function formatClock(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  return parts.map((p) => (p.type === "timeZoneName" ? zoneLabel(parts, tz) : p.value)).join("");
}

/** 2026-09-15T17:00:00Z -> 20260915T170000Z (Google Calendar template format). */
export function googleDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Plain-text excerpt of server-rendered HTML (never inserted as HTML). */
export function htmlExcerpt(html: string, max = 160): string {
  const text = (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
