import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Offline",
};

/**
 * Served by the service worker as the navigation fallback whenever a route
 * isn't cached and the network request fails, so a lost connection shows
 * this instead of the browser's raw offline error.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
        <WifiOff className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-fg-muted">
        This page hasn&apos;t been opened before, so it isn&apos;t available offline yet. Tools you&apos;ve already
        visited will keep working.
      </p>
      <Button asChild className="mt-5">
        <Link href="/">Back to DevBox</Link>
      </Button>
    </div>
  );
}
