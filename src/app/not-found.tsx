import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <p className="font-mono text-sm text-fg-subtle">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        That page doesn&apos;t exist. Try the command palette or head back home.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to DevBox</Link>
      </Button>
    </div>
  );
}
