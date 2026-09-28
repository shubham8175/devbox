import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonDiffTool } from "@/components/tools/json-diff-tool";

export const metadata = toolMetadata("json-diff");

export default function Page() {
  return (
    <ToolPage toolId="json-diff">
      <JsonDiffTool />
    </ToolPage>
  );
}
