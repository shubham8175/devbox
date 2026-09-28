import { Suspense } from "react";
import { ShieldCheck, Wrench } from "lucide-react";
import { ToolSearch } from "@/components/home/tool-search";
import { tools } from "@/data/tools";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-surface shadow-card">
            <Wrench className="h-4.5 w-4.5 text-accent-strong" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-9">DevBox</h1>
            <p className="text-sm text-fg-muted">Developer tools without the noise.</p>
          </div>
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-xs text-fg-subtle shadow-card">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span className="font-medium text-fg-muted">{tools.length} tools</span>
          <span className="text-border-strong">·</span>
          Your data stays in your browser.
        </p>
      </div>
      <Suspense fallback={<div className="h-12 skeleton" />}>
        <ToolSearch />
      </Suspense>
    </div>
  );
}
