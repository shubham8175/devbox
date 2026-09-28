export type GradientType = "linear" | "radial" | "conic";
export type RadialShape = "circle" | "ellipse";

export interface ColorStop {
  color: string;
  /** 0..100 */
  position: number;
}

export interface GradientConfig {
  type: GradientType;
  angle: number;
  shape: RadialShape;
  /** e.g. "center", "top left", "50% 50%" */
  position: string;
  stops: ColorStop[];
}

export const RADIAL_POSITIONS = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"];

export function gradientValue(cfg: GradientConfig): string {
  const stops = [...cfg.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${Math.round(s.position)}%`)
    .join(", ");
  switch (cfg.type) {
    case "linear":
      return `linear-gradient(${Math.round(cfg.angle)}deg, ${stops})`;
    case "radial":
      return `radial-gradient(${cfg.shape} at ${cfg.position}, ${stops})`;
    case "conic":
      return `conic-gradient(from ${Math.round(cfg.angle)}deg at ${cfg.position}, ${stops})`;
  }
}

export function gradientCss(cfg: GradientConfig): string {
  return `background: ${gradientValue(cfg)};`;
}

/** Tailwind arbitrary-value class. Spaces must become underscores inside brackets. */
export function gradientTailwind(cfg: GradientConfig): string {
  return `bg-[${gradientValue(cfg).replace(/\s+/g, "_")}]`;
}

export const GRADIENT_PRESETS: Array<{ name: string; config: GradientConfig }> = [
  { name: "Indigo dusk", config: { type: "linear", angle: 135, shape: "circle", position: "center", stops: [{ color: "#7c8cff", position: 0 }, { color: "#a855f7", position: 100 }] } },
  { name: "Sunset", config: { type: "linear", angle: 90, shape: "circle", position: "center", stops: [{ color: "#f5b342", position: 0 }, { color: "#ff6b6b", position: 55 }, { color: "#a855f7", position: 100 }] } },
  { name: "Mint", config: { type: "linear", angle: 180, shape: "circle", position: "center", stops: [{ color: "#3ecf8e", position: 0 }, { color: "#0ea5e9", position: 100 }] } },
  { name: "Spotlight", config: { type: "radial", angle: 0, shape: "circle", position: "top left", stops: [{ color: "#ffffff", position: 0 }, { color: "#111318", position: 100 }] } },
  { name: "Color wheel", config: { type: "conic", angle: 0, shape: "circle", position: "center", stops: [{ color: "#ff6b6b", position: 0 }, { color: "#f5b342", position: 33 }, { color: "#3ecf8e", position: 66 }, { color: "#ff6b6b", position: 100 }] } },
];
