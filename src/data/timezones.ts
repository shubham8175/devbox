export interface TimezoneOption {
  id: string;
  label: string;
}

/** Commonly useful timezones, listed first in selects. */
export const FEATURED_TIMEZONES: TimezoneOption[] = [
  { id: "Asia/Kolkata", label: "India (IST) · Asia/Kolkata" },
  { id: "Asia/Riyadh", label: "Saudi Arabia (AST) · Asia/Riyadh" },
  { id: "Asia/Dubai", label: "UAE (GST) · Asia/Dubai" },
  { id: "UTC", label: "UTC" },
  { id: "Europe/London", label: "London · Europe/London" },
  { id: "Europe/Berlin", label: "Berlin · Europe/Berlin" },
  { id: "America/New_York", label: "New York (ET) · America/New_York" },
  { id: "America/Chicago", label: "Chicago (CT) · America/Chicago" },
  { id: "America/Los_Angeles", label: "Los Angeles (PT) · America/Los_Angeles" },
  { id: "Asia/Singapore", label: "Singapore · Asia/Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo (JST) · Asia/Tokyo" },
  { id: "Australia/Sydney", label: "Sydney (AEST) · Australia/Sydney" },
];

/** All IANA zones the runtime knows about, falling back to the featured list. */
export function allTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported && supported.length) {
      const set = new Set([...FEATURED_TIMEZONES.map((t) => t.id), ...supported]);
      return Array.from(set);
    }
  } catch {
    // ignore
  }
  return FEATURED_TIMEZONES.map((t) => t.id);
}
