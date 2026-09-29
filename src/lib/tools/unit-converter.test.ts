import { describe, expect, it } from "vitest";
import { convert, convertAll, formatResult, getCategory, parseQuantity, UNIT_CATEGORIES } from "@/lib/tools/unit-converter";

const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe("convert", () => {
  it("length", () => {
    close(convert("length", 1, "km", "m"), 1000);
    close(convert("length", 1, "mi", "km"), 1.609344);
    close(convert("length", 12, "in", "ft"), 1);
    close(convert("length", 1, "nmi", "m"), 1852);
    close(convert("length", 100, "cm", "in"), 39.3700787, 5);
  });

  it("mass", () => {
    close(convert("mass", 1, "lb", "g"), 453.59237);
    close(convert("mass", 16, "oz", "lb"), 1);
    close(convert("mass", 1, "st", "lb"), 14);
    close(convert("mass", 1, "t", "kg"), 1000);
  });

  it("temperature uses formulas, not factors", () => {
    close(convert("temperature", 100, "C", "F"), 212);
    close(convert("temperature", 32, "F", "C"), 0);
    close(convert("temperature", -40, "C", "F"), -40);
    close(convert("temperature", 0, "C", "K"), 273.15);
    close(convert("temperature", 300, "K", "F"), 80.33, 2);
    close(convert("temperature", 98.6, "F", "K"), 310.15, 2);
    close(convert("temperature", 25, "C", "C"), 25);
  });

  it("data distinguishes decimal and binary units", () => {
    close(convert("data", 1, "KB", "B"), 1000);
    close(convert("data", 1, "KiB", "B"), 1024);
    close(convert("data", 1, "GiB", "MB"), 1073.741824);
    close(convert("data", 1, "GB", "GiB"), 0.931322575, 8);
    close(convert("data", 1, "B", "bit"), 8);
    close(convert("data", 1, "TiB", "GiB"), 1024);
  });

  it("data rate", () => {
    close(convert("data-rate", 100, "Mbps", "MB/s"), 12.5);
    close(convert("data-rate", 1, "Gbps", "Mbps"), 1000);
    close(convert("data-rate", 1, "B/s", "bps"), 8);
  });

  it("time with 30-day months and 365-day years", () => {
    close(convert("time", 1, "d", "h"), 24);
    close(convert("time", 1, "mo", "d"), 30);
    close(convert("time", 1, "yr", "d"), 365);
    close(convert("time", 90, "min", "h"), 1.5);
    close(convert("time", 1500, "ms", "s"), 1.5);
    close(convert("time", 2, "wk", "d"), 14);
  });

  it("area", () => {
    close(convert("area", 1, "ha", "m²"), 10000);
    close(convert("area", 1, "ac", "ft²"), 43560, 3);
    close(convert("area", 1, "km²", "ha"), 100);
    close(convert("area", 1, "mi²", "ac"), 640, 3);
  });

  it("volume", () => {
    close(convert("volume", 1, "gal", "l"), 3.785411784);
    close(convert("volume", 3, "tsp", "tbsp"), 1);
    close(convert("volume", 1, "cup", "fl oz"), 8);
    close(convert("volume", 4, "qt", "gal"), 1);
    close(convert("volume", 1, "m³", "l"), 1000);
  });

  it("speed", () => {
    close(convert("speed", 100, "km/h", "mph"), 62.137119, 5);
    close(convert("speed", 1, "kn", "km/h"), 1.852);
    close(convert("speed", 1, "m/s", "ft/s"), 3.2808399, 5);
  });

  it("pressure", () => {
    close(convert("pressure", 1, "atm", "Pa"), 101325);
    close(convert("pressure", 1, "bar", "psi"), 14.5037738, 5);
    close(convert("pressure", 760, "mmHg", "atm"), 1, 5);
  });

  it("energy", () => {
    close(convert("energy", 1, "kWh", "kJ"), 3600);
    close(convert("energy", 1, "kcal", "J"), 4184);
    close(convert("energy", 1, "Wh", "J"), 3600);
  });

  it("angle", () => {
    close(convert("angle", 180, "deg", "rad"), Math.PI);
    close(convert("angle", 1, "turn", "deg"), 360);
    close(convert("angle", 100, "grad", "deg"), 90);
  });

  it("frequency", () => {
    close(convert("frequency", 2.4, "GHz", "MHz"), 2400);
    close(convert("frequency", 1000, "Hz", "kHz"), 1);
  });

  it("returns NaN for unknown units or non-finite values", () => {
    expect(convert("length", 1, "km", "parsec")).toBeNaN();
    expect(convert("length", Number.POSITIVE_INFINITY, "km", "m")).toBeNaN();
    expect(() => getCategory("nope" as never)).toThrow();
  });

  it("every unit round-trips through the base unit", () => {
    for (const cat of UNIT_CATEGORIES) {
      for (const unit of cat.units) {
        const there = convert(cat.id, 123.456, unit.id, cat.base);
        const back = convert(cat.id, there, cat.base, unit.id);
        expect(back).toBeCloseTo(123.456, 6);
      }
    }
  });
});

describe("convertAll", () => {
  it("lists every unit of the category", () => {
    const all = convertAll("length", 1, "km");
    expect(all.map((r) => r.unit.id)).toEqual(getCategory("length").units.map((u) => u.id));
    expect(all.find((r) => r.unit.id === "m")?.value).toBe(1000);
  });
});

describe("formatResult", () => {
  it("avoids floating-point noise and uses exponents for extremes", () => {
    expect(formatResult(0.1 + 0.2)).toBe("0.3");
    expect(formatResult(1000)).toBe("1,000");
    expect(formatResult(1609.344)).toBe("1,609.344");
    expect(formatResult(0)).toBe("0");
    expect(formatResult(1e18)).toBe("1e+18");
    expect(formatResult(1.5e-12)).toBe("1.5e-12");
    expect(formatResult(Number.NaN)).toBe("—");
    expect(formatResult(-40)).toBe("-40");
  });
});

describe("parseQuantity", () => {
  it("parses value + unit by id, alias or label", () => {
    expect(parseQuantity("12.5 km")).toEqual({ value: 12.5, unitId: "km", category: "length" });
    expect(parseQuantity("3ft")).toEqual({ value: 3, unitId: "ft", category: "length" });
    expect(parseQuantity("-40 °F")).toEqual({ value: -40, unitId: "F", category: "temperature" });
    expect(parseQuantity("2 GiB")).toEqual({ value: 2, unitId: "GiB", category: "data" });
    expect(parseQuantity("5 pounds")).toEqual({ value: 5, unitId: "lb", category: "mass" });
    expect(parseQuantity("1.5e3 Hz")).toEqual({ value: 1500, unitId: "Hz", category: "frequency" });
    expect(parseQuantity("100 Mbps")).toEqual({ value: 100, unitId: "Mbps", category: "data-rate" });
    expect(parseQuantity("2 fl oz")).toEqual({ value: 2, unitId: "fl oz", category: "volume" });
  });

  it("prefers exact case for ambiguous ids and honours the preferred category", () => {
    expect(parseQuantity("8 B")?.unitId).toBe("B");
    expect(parseQuantity("8 b")?.unitId).toBe("bit");
    expect(parseQuantity("5 m")?.category).toBe("length");
    expect(parseQuantity("5 m", "time")?.unitId).toBe("min");
  });

  it("rejects malformed input", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("km")).toBeNull();
    expect(parseQuantity("12")).toBeNull();
    expect(parseQuantity("12 parsecs")).toBeNull();
  });
});
