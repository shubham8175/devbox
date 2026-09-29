import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

// Required by the desktop build (`output: "export"`); the web build already
// renders this route statically, so it changes nothing there.
export const dynamic = "force-static";

/**
 * Web app manifest, served at /manifest.webmanifest and linked from every
 * page by Next. This is what lets phones and desktops "Add to Home Screen" /
 * install DevBox as a standalone app. Icons come from scripts/generate-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DevBox",
    short_name: "DevBox",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0b0e",
    theme_color: "#0a0b0e",
    orientation: "any",
    categories: ["developer tools", "utilities", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press / right-click shortcuts on the installed icon.
    shortcuts: [
      { name: "JSON Toolbox", url: "/tools/json" },
      { name: "Epoch Converter", url: "/tools/epoch" },
      { name: "JWT Decoder", url: "/tools/jwt" },
      { name: "MongoDB ObjectId", url: "/tools/objectid" },
      { name: "QR Code Generator", url: "/tools/qr" },
    ],
    // GET-only, no backend: the shared text/URL is read from the query string
    // by the QR tool on the client and never sent anywhere (qr-tool.tsx).
    share_target: {
      action: "/tools/qr",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
