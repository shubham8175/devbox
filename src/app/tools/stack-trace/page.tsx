import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { StackTraceTool } from "@/components/tools/stack-trace-tool";

export const metadata = toolMetadata("stack-trace");

export default function Page() {
  return (
    <ToolPage toolId="stack-trace" wide>
      <StackTraceTool />
    </ToolPage>
  );
}
