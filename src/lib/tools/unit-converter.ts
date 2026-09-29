export type UnitCategoryId = "length" | "mass" | "temperature" | "data" | "data-rate" | "time" | "area" | "volume" | "speed" | "pressure" | "energy" | "angle" | "frequency";

export interface Unit {
  id: string;
  label: string;
  /** Multiplier to the category's base unit (ignored for temperature). */
  factor: number;
  /** Extra names accepted by parseQuantity, lower-case. */
  aliases?: string[];
}

export interface UnitCategory {
  id: UnitCategoryId;
  label: string;
  base: string;
  units: Unit[];
  note?: string;
}

const u = (id: string, label: string, factor: number, aliases: string[] = []): Unit => ({ id, label, factor, aliases });

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    label: "Length",
    base: "m",
    units: [u("mm", "Millimetre", 0.001, ["millimeter", "millimetre", "millimeters", "millimetres"]), u("cm", "Centimetre", 0.01, ["centimeter", "centimetre", "centimeters"]), u("m", "Metre", 1, ["meter", "metre", "meters", "metres"]), u("km", "Kilometre", 1000, ["kilometer", "kilometre", "kilometers", "kilometres"]), u("in", "Inch", 0.0254, ["inch", "inches", '"']), u("ft", "Foot", 0.3048, ["foot", "feet", "'"]), u("yd", "Yard", 0.9144, ["yard", "yards"]), u("mi", "Mile", 1609.344, ["mile", "miles"]), u("nmi", "Nautical mile", 1852, ["nautical mile", "nautical miles", "nm"])],
  },
  {
    id: "mass",
    label: "Mass",
    base: "kg",
    units: [u("mg", "Milligram", 1e-6, ["milligram", "milligrams"]), u("g", "Gram", 0.001, ["gram", "grams"]), u("kg", "Kilogram", 1, ["kilogram", "kilograms", "kilo", "kilos"]), u("t", "Tonne", 1000, ["tonne", "tonnes", "ton", "tons", "metric ton"]), u("oz", "Ounce", 0.028349523125, ["ounce", "ounces"]), u("lb", "Pound", 0.45359237, ["lbs", "pound", "pounds"]), u("st", "Stone", 6.35029318, ["stone", "stones"])],
  },
  {
    id: "temperature",
    label: "Temperature",
    base: "C",
    units: [u("C", "Celsius", 1, ["c", "°c", "celsius", "degc"]), u("F", "Fahrenheit", 1, ["f", "°f", "fahrenheit", "degf"]), u("K", "Kelvin", 1, ["k", "kelvin"])],
    note: "Converted with the exact formulas: °F = °C × 9⁄5 + 32, K = °C + 273.15.",
  },
  {
    id: "data",
    label: "Data size",
    base: "B",
    units: [u("bit", "Bit", 0.125, ["bits", "b"]), u("B", "Byte", 1, ["byte", "bytes"]), u("KB", "Kilobyte (10³)", 1e3, ["kilobyte", "kilobytes"]), u("MB", "Megabyte (10⁶)", 1e6, ["megabyte", "megabytes"]), u("GB", "Gigabyte (10⁹)", 1e9, ["gigabyte", "gigabytes"]), u("TB", "Terabyte (10¹²)", 1e12, ["terabyte", "terabytes"]), u("KiB", "Kibibyte (2¹⁰)", 1024, ["kibibyte"]), u("MiB", "Mebibyte (2²⁰)", 1024 ** 2, ["mebibyte"]), u("GiB", "Gibibyte (2³⁰)", 1024 ** 3, ["gibibyte"]), u("TiB", "Tebibyte (2⁴⁰)", 1024 ** 4, ["tebibyte"])],
    note: "KB/MB/GB are decimal (1 KB = 1,000 B) as used by drive makers and the SI. KiB/MiB/GiB are binary (1 KiB = 1,024 B) as most operating systems report.",
  },
  {
    id: "data-rate",
    label: "Data rate",
    base: "bps",
    units: [u("bps", "Bit per second", 1, ["bit/s", "bits/s"]), u("kbps", "Kilobit per second", 1e3, ["kbit/s", "kb/s"]), u("Mbps", "Megabit per second", 1e6, ["mbit/s", "mb/s"]), u("Gbps", "Gigabit per second", 1e9, ["gbit/s", "gb/s"]), u("B/s", "Byte per second", 8, ["bytes/s"]), u("KB/s", "Kilobyte per second", 8e3), u("MB/s", "Megabyte per second", 8e6), u("GB/s", "Gigabyte per second", 8e9)],
    note: "Network speeds are quoted in bits per second; downloads in bytes per second. 100 Mbps ≈ 12.5 MB/s.",
  },
  {
    id: "time",
    label: "Time",
    base: "s",
    units: [u("ms", "Millisecond", 0.001, ["millisecond", "milliseconds"]), u("s", "Second", 1, ["sec", "secs", "second", "seconds"]), u("min", "Minute", 60, ["m", "mins", "minute", "minutes"]), u("h", "Hour", 3600, ["hr", "hrs", "hour", "hours"]), u("d", "Day", 86400, ["day", "days"]), u("wk", "Week", 604800, ["w", "week", "weeks"]), u("mo", "Month (30 d)", 2592000, ["month", "months"]), u("yr", "Year (365 d)", 31536000, ["y", "year", "years"])],
    note: "A month is taken as 30 days and a year as 365 days.",
  },
  {
    id: "area",
    label: "Area",
    base: "m²",
    units: [u("mm²", "Square millimetre", 1e-6, ["mm2", "sqmm"]), u("cm²", "Square centimetre", 1e-4, ["cm2", "sqcm"]), u("m²", "Square metre", 1, ["m2", "sqm"]), u("ha", "Hectare", 1e4, ["hectare", "hectares"]), u("km²", "Square kilometre", 1e6, ["km2", "sqkm"]), u("in²", "Square inch", 0.00064516, ["in2", "sqin"]), u("ft²", "Square foot", 0.09290304, ["ft2", "sqft"]), u("ac", "Acre", 4046.8564224, ["acre", "acres"]), u("mi²", "Square mile", 2589988.110336, ["mi2", "sqmi"])],
  },
  {
    id: "volume",
    label: "Volume",
    base: "l",
    units: [u("ml", "Millilitre", 0.001, ["milliliter", "millilitre", "cc"]), u("l", "Litre", 1, ["liter", "litre", "liters", "litres"]), u("m³", "Cubic metre", 1000, ["m3"]), u("tsp", "Teaspoon (US)", 0.00492892159375, ["teaspoon", "teaspoons"]), u("tbsp", "Tablespoon (US)", 0.01478676478125, ["tablespoon", "tablespoons"]), u("fl oz", "Fluid ounce (US)", 0.0295735295625, ["floz", "fl.oz", "fluid ounce"]), u("cup", "Cup (US)", 0.2365882365, ["cups"]), u("pt", "Pint (US)", 0.473176473, ["pint", "pints"]), u("qt", "Quart (US)", 0.946352946, ["quart", "quarts"]), u("gal", "Gallon (US)", 3.785411784, ["gallon", "gallons"])],
    note: "Cooking and liquid units are US customary.",
  },
  {
    id: "speed",
    label: "Speed",
    base: "m/s",
    units: [u("m/s", "Metre per second", 1, ["mps"]), u("km/h", "Kilometre per hour", 1000 / 3600, ["kmh", "kph"]), u("mph", "Mile per hour", 1609.344 / 3600, ["mi/h"]), u("kn", "Knot", 1852 / 3600, ["knot", "knots", "kt"]), u("ft/s", "Foot per second", 0.3048, ["fps"])],
  },
  {
    id: "pressure",
    label: "Pressure",
    base: "Pa",
    units: [u("Pa", "Pascal", 1, ["pascal"]), u("kPa", "Kilopascal", 1000, ["kilopascal"]), u("bar", "Bar", 1e5), u("psi", "Pound per square inch", 6894.757293168), u("atm", "Atmosphere", 101325, ["atmosphere"]), u("mmHg", "Millimetre of mercury", 133.322387415, ["torr"])],
  },
  {
    id: "energy",
    label: "Energy",
    base: "J",
    units: [u("J", "Joule", 1, ["joule", "joules"]), u("kJ", "Kilojoule", 1000, ["kilojoule"]), u("Wh", "Watt-hour", 3600), u("kWh", "Kilowatt-hour", 3.6e6), u("cal", "Calorie", 4.184, ["calorie", "calories"]), u("kcal", "Kilocalorie", 4184, ["kilocalorie", "kilocalories", "Cal"])],
  },
  {
    id: "angle",
    label: "Angle",
    base: "deg",
    units: [u("deg", "Degree", 1, ["°", "degree", "degrees"]), u("rad", "Radian", 180 / Math.PI, ["radian", "radians"]), u("grad", "Gradian", 0.9, ["gon", "gradian", "gradians"]), u("turn", "Turn", 360, ["turns", "rev", "revolution"])],
  },
  {
    id: "frequency",
    label: "Frequency",
    base: "Hz",
    units: [u("Hz", "Hertz", 1, ["hertz"]), u("kHz", "Kilohertz", 1e3, ["kilohertz"]), u("MHz", "Megahertz", 1e6, ["megahertz"]), u("GHz", "Gigahertz", 1e9, ["gigahertz"])],
  },
];

const CATEGORY_BY_ID = new Map(UNIT_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: UnitCategoryId): UnitCategory {
  const c = CATEGORY_BY_ID.get(id);
  if (!c) throw new Error(`Unknown unit category: ${id}`);
  return c;
}

function findUnit(category: UnitCategory, id: string): Unit | undefined {
  return category.units.find((x) => x.id === id);
}

function toCelsius(value: number, from: string): number {
  if (from === "F") return ((value - 32) * 5) / 9;
  if (from === "K") return value - 273.15;
  return value;
}

function fromCelsius(c: number, to: string): number {
  if (to === "F") return (c * 9) / 5 + 32;
  if (to === "K") return c + 273.15;
  return c;
}

export function convert(category: UnitCategoryId, value: number, from: string, to: string): number {
  const cat = getCategory(category);
  const a = findUnit(cat, from);
  const b = findUnit(cat, to);
  if (!a || !b) return Number.NaN;
  if (!Number.isFinite(value)) return Number.NaN;
  if (category === "temperature") return fromCelsius(toCelsius(value, from), to);
  return (value * a.factor) / b.factor;
}

export function convertAll(category: UnitCategoryId, value: number, from: string): Array<{ unit: Unit; value: number }> {
  return getCategory(category).units.map((unit) => ({ unit, value: convert(category, value, from, unit.id) }));
}

/** Format for display: up to 10 significant digits, no floating-point noise, exponent for extremes. */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, "e");
  const rounded = Number(n.toPrecision(10));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 20, useGrouping: true });
}

export interface ParsedQuantity {
  value: number;
  unitId: string;
  category: UnitCategoryId;
}

/** Parse "12.5 km", "3ft", "-40 °F", "2 GiB" → value + unit + category. */
export function parseQuantity(input: string, preferred?: UnitCategoryId): ParsedQuantity | null {
  const m = input.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.+)$/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const raw = m[2].trim();
  const lower = raw.toLowerCase();
  const matchIn = (cats: UnitCategory[]): ParsedQuantity | null => {
    // Exact (case-sensitive) ids first so "MB" vs "mb", "B" vs "b" resolve as written.
    const passes: Array<(x: Unit) => boolean> = [
      (x) => x.id === raw,
      (x) => x.id.toLowerCase() === lower || (x.aliases?.some((a) => a.toLowerCase() === lower) ?? false),
      (x) => x.label.toLowerCase() === lower || x.label.toLowerCase().split(" (")[0] === lower,
    ];
    for (const pass of passes) {
      for (const cat of cats) {
        const unit = cat.units.find(pass);
        if (unit) return { value, unitId: unit.id, category: cat.id };
      }
    }
    return null;
  };
  // The category the user is already in wins over every other, e.g. "5 m" in Time is minutes.
  if (preferred) {
    const hit = matchIn([getCategory(preferred)]);
    if (hit) return hit;
  }
  const rest = matchIn(UNIT_CATEGORIES.filter((c) => c.id !== preferred));
  if (rest) return rest;
  return null;
}

export const UNIT_CONVERTER_SAMPLE = "26.2 mi";
