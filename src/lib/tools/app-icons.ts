export type IconPlatform = "web" | "ios" | "android";

export interface IconSpec {
  platform: IconPlatform;
  /** Output filename (inside the platform folder in the ZIP) */
  file: string;
  size: number;
  label: string;
  /** Fill with the background colour (no transparency) */
  opaque: boolean;
  /** PWA maskable icon: content is padded into the safe zone */
  maskable?: boolean;
}

export const ICON_SPECS: IconSpec[] = [
  // Web
  { platform: "web", file: "favicon-16x16.png", size: 16, label: "Favicon 16", opaque: false },
  { platform: "web", file: "favicon-32x32.png", size: 32, label: "Favicon 32", opaque: false },
  { platform: "web", file: "favicon-48x48.png", size: 48, label: "Favicon 48", opaque: false },
  { platform: "web", file: "apple-touch-icon.png", size: 180, label: "Apple touch icon", opaque: true },
  { platform: "web", file: "icon-192.png", size: 192, label: "PWA 192", opaque: false },
  { platform: "web", file: "icon-512.png", size: 512, label: "PWA 512", opaque: false },
  { platform: "web", file: "icon-512-maskable.png", size: 512, label: "PWA 512 maskable", opaque: true, maskable: true },
  // iOS (common set)
  { platform: "ios", file: "Icon-40.png", size: 40, label: "Notification @2x (20pt)", opaque: true },
  { platform: "ios", file: "Icon-58.png", size: 58, label: "Settings @2x (29pt)", opaque: true },
  { platform: "ios", file: "Icon-60.png", size: 60, label: "Notification @3x (20pt)", opaque: true },
  { platform: "ios", file: "Icon-80.png", size: 80, label: "Spotlight @2x (40pt)", opaque: true },
  { platform: "ios", file: "Icon-87.png", size: 87, label: "Settings @3x (29pt)", opaque: true },
  { platform: "ios", file: "Icon-120.png", size: 120, label: "iPhone app @2x (60pt)", opaque: true },
  { platform: "ios", file: "Icon-152.png", size: 152, label: "iPad app @2x (76pt)", opaque: true },
  { platform: "ios", file: "Icon-167.png", size: 167, label: "iPad Pro @2x (83.5pt)", opaque: true },
  { platform: "ios", file: "Icon-180.png", size: 180, label: "iPhone app @3x (60pt)", opaque: true },
  { platform: "ios", file: "Icon-1024.png", size: 1024, label: "App Store 1024", opaque: true },
  // Android
  { platform: "android", file: "mipmap-mdpi/ic_launcher.png", size: 48, label: "mdpi 48", opaque: false },
  { platform: "android", file: "mipmap-hdpi/ic_launcher.png", size: 72, label: "hdpi 72", opaque: false },
  { platform: "android", file: "mipmap-xhdpi/ic_launcher.png", size: 96, label: "xhdpi 96", opaque: false },
  { platform: "android", file: "mipmap-xxhdpi/ic_launcher.png", size: 144, label: "xxhdpi 144", opaque: false },
  { platform: "android", file: "mipmap-xxxhdpi/ic_launcher.png", size: 192, label: "xxxhdpi 192", opaque: false },
  { platform: "android", file: "playstore-icon-512.png", size: 512, label: "Play Store 512", opaque: true },
];

export const PLATFORM_LABELS: Record<IconPlatform, string> = {
  web: "Web & PWA",
  ios: "iOS",
  android: "Android",
};

/** Centre-crop rectangle for a non-square source. */
export function squareCrop(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const side = Math.min(w, h);
  return { x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), w: side, h: side };
}

/** Maskable icons keep content inside the central 80% safe zone. */
export const MASKABLE_SAFE_ZONE = 0.8;

export function manifestSnippet(): string {
  return JSON.stringify(
    {
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
}

export function headSnippet(): string {
  return [
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/manifest.json">',
  ].join("\n");
}
