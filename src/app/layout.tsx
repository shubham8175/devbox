import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DevBox",
    template: "%s · DevBox",
  },
  description: "Developer tools without the noise. Everything runs locally in your browser.",
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
