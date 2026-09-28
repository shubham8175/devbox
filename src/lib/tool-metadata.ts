import type { Metadata } from "next";
import { getTool } from "@/data/tools";

/** Build page metadata for a tool from the central registry. */
export function toolMetadata(id: string): Metadata {
  const tool = getTool(id);
  if (!tool) return { title: "Tool" };
  return {
    title: tool.name,
    description: tool.description,
    keywords: tool.keywords,
  };
}
