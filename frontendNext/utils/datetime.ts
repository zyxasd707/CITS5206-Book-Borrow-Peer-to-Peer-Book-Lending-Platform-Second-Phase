// All timestamps in BookHive are presented in Perth time (AWST, UTC+8).
// Backend writes naive ISO strings (no trailing Z / offset) for some routes
// because the SQLAlchemy DateTime columns are timezone-naive but stored in
// UTC. parseAsUtc normalises both shapes so the caller never has to think
// about it.

const PERTH_TZ = "Australia/Perth";
const HAS_TZ_SUFFIX = /Z$|[+-]\d{2}:?\d{2}$/;

// Exported for callers that need an epoch-ms or Date for sorting/maths and
// must respect the same naive-string convention as the formatters.
export function parseAsUtc(value: string): Date {
  const trimmed = value.trim();
  const normalised = HAS_TZ_SUFFIX.test(trimmed) ? trimmed : trimmed + "Z";
  return new Date(normalised);
}

export function formatLocalDateTime(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const dt = parseAsUtc(value);
  if (Number.isNaN(dt.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: PERTH_TZ,
  }).format(dt);
}

export function formatLocalDate(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const dt = parseAsUtc(value);
  if (Number.isNaN(dt.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: PERTH_TZ,
  }).format(dt);
}

export function formatJoinMonth(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const dt = parseAsUtc(value);
  if (Number.isNaN(dt.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "long",
    timeZone: PERTH_TZ,
  }).format(dt);
}
