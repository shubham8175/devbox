import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { DateDiffTool } from "@/components/tools/date-diff-tool";

export const metadata = toolMetadata("date-diff");

export default function Page() {
  return (
    <ToolPage toolId="date-diff">
      <DateDiffTool />
    </ToolPage>
  );
}
