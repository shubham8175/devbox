"use client";

import { useEffect } from "react";
import { recordRecent } from "@/lib/store";

/** Records a visit to a tool in the "recently used" list (tool id only). */
export function RecentTracker({ toolId }: { toolId: string }) {
  useEffect(() => {
    recordRecent(toolId);
  }, [toolId]);
  return null;
}
