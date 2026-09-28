import type { Metadata } from "next";
import { getTool } from "@/data/tools";

/** Build page metadata for a tool from the central registry. */
export function toolMetadata(id: string): Metadata {
  const tool = getTool(id);
  if (!tool) return { title: "Tool" };
  return {
    title: tool.name,
    description: tool.description,
    alternates: { canonical: tool.href },
    openGraph: {
      type: "website",
      title: `${tool.name} · DevBox`,
      description: tool.description,
      url: tool.href,
    },
    twitter: { card: "summary", title: `${tool.name} · DevBox`, description: tool.description },
  };
}
