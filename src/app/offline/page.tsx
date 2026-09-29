import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Served by the service worker as the navigation fallback when a route is not
 * in the cache and the network request fails, so a lost connection shows this
 * instead of the browser's raw error page. Tool pages themselves are warmed
 * into the cache in the background, so this mostly appears for unknown URLs.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
        <WifiOff className="h-5 w-5" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-fg-muted">
        This page isn&apos;t available offline yet. The tools you have already opened, and any that finished
        downloading in the background, keep working without a connection.
      </p>
      <Button asChild className="mt-5">
        <Link href="/">Back to DevBox</Link>
      </Button>
    </div>
  );
}
