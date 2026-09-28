import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { InvisibleCharsTool } from "@/components/tools/invisible-chars-tool";

export const metadata = toolMetadata("invisible-chars");

export default function Page() {
  return (
    <ToolPage toolId="invisible-chars">
      <InvisibleCharsTool />
    </ToolPage>
  );
}
