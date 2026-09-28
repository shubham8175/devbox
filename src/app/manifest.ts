import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DevBox",
    short_name: "DevBox",
    description: "Developer tools without the noise.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0b0e",
    theme_color: "#0a0b0e",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Epoch Converter", url: "/tools/epoch" },
      { name: "MongoDB ObjectId", url: "/tools/objectid" },
      { name: "JSON Toolbox", url: "/tools/json" },
      { name: "JWT Decoder", url: "/tools/jwt" },
      { name: "QR Generator", url: "/tools/qr" },
    ],
    // GET-only, no backend: the shared text/URL is just read from the query
    // string on the QR tool page, never sent anywhere.
    share_target: {
      action: "/tools/qr",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
