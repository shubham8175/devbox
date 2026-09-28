import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { UnicodeTool } from "@/components/tools/unicode-tool";

export const metadata = toolMetadata("unicode");

export default function Page() {
  return (
    <ToolPage toolId="unicode">
      <UnicodeTool />
    </ToolPage>
  );
}
