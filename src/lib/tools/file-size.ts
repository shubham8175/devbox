export type SizeUnit = "B" | "KB" | "MB" | "GB" | "TB" | "PB";
export type SizeBase = "decimal" | "binary";

export const SIZE_UNITS: SizeUnit[] = ["B", "KB", "MB", "GB", "TB", "PB"];

const BINARY_LABELS: Record<SizeUnit, string> = {
  B: "B",
  KB: "KiB",
  MB: "MiB",
  GB: "GiB",
  TB: "TiB",
  PB: "PiB",
};

export function unitLabel(unit: SizeUnit, base: SizeBase): string {
  return base === "binary" ? BINARY_LABELS[unit] : unit;
}

export function unitFactor(unit: SizeUnit, base: SizeBase): number {
  const k = base === "binary" ? 1024 : 1000;
  return k ** SIZE_UNITS.indexOf(unit);
}

export function toBytes(value: number, unit: SizeUnit, base: SizeBase): number {
  return value * unitFactor(unit, base);
}

export function fromBytes(bytes: number, unit: SizeUnit, base: SizeBase): number {
  return bytes / unitFactor(unit, base);
}

export function convertAll(value: number, unit: SizeUnit, base: SizeBase): Record<SizeUnit, number> {
  const bytes = toBytes(value, unit, base);
  return Object.fromEntries(SIZE_UNITS.map((u) => [u, fromBytes(bytes, u, base)])) as Record<SizeUnit, number>;
}

/** Pick a sensible unit and format, e.g. 1536 → "1.5 KiB" */
export function humanSize(bytes: number, base: SizeBase): string {
  if (!Number.isFinite(bytes)) return "—";
  const k = base === "binary" ? 1024 : 1000;
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= k && i < SIZE_UNITS.length - 1) {
    v /= k;
    i++;
  }
  const sign = bytes < 0 ? "-" : "";
  return `${sign}${formatSize(v)} ${unitLabel(SIZE_UNITS[i], base)}`;
}

export function formatSize(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}
