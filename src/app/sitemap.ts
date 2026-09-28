import type { MetadataRoute } from "next";
import { tools } from "@/data/tools";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    ...tools.map((tool) => ({ url: `${SITE_URL}${tool.href}` })),
  ];
}
