import type { LucideIcon } from "lucide-react";

export type ToolCategory =
  | "Time"
  | "MongoDB"
  | "Database"
  | "API & HTTP"
  | "JSON & Data"
  | "Encoding"
  | "Security"
  | "Text"
  | "Git"
  | "DevOps"
  | "Web"
  | "CSS"
  | "Images & QR"
  | "Mobile"
  | "Networking & Geo"
  | "Generators"
  | "Utilities";

export interface ToolDefinition {
  /** Stable slug, also used as route segment under /tools */
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  keywords: string[];
  icon: LucideIcon;
  /** Highlighted in the "Popular" section on the homepage */
  popular?: boolean;
  /** Optional two-key sequence, e.g. "g j": press g then j anywhere outside an input */
  shortcut?: string;
}

export interface ToolWithRoute extends ToolDefinition {
  href: string;
}
