import type { MetadataRoute } from "next";
import { tools } from "@/data/tools";
import { SITE_URL } from "@/lib/site";

// Required by the desktop build (`output: "export"`); the web build already
// renders this route statically, so it changes nothing there.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    ...tools.map((tool) => ({ url: `${SITE_URL}${tool.href}` })),
  ];
}
