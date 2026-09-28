import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DevBox — Free Online Developer Tools",
    template: "%s · DevBox",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "DevBox",
    title: "DevBox — Free Online Developer Tools",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: "summary", title: "DevBox — Free Online Developer Tools", description: SITE_DESCRIPTION },
  applicationName: "DevBox",
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: "DevBox",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next 16 only emits the unprefixed mobile-web-app-capable tag for
    // appleWebApp.capable; older iOS/iPadOS Safari still needs this one too.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Applies the stored theme class before first paint to avoid a flash.
 * Only the theme preference ("light" | "dark") is read from localStorage.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("devbox-theme");if(t==="light"){document.documentElement.classList.add("light")}else{document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
