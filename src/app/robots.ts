import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Required by the desktop build (`output: "export"`); the web build already
// renders this route statically, so it changes nothing there.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
