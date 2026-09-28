import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { BackoffTool } from "@/components/tools/backoff-tool";

export const metadata = toolMetadata("backoff");

export default function Page() {
  return (
    <ToolPage toolId="backoff">
      <BackoffTool />
    </ToolPage>
  );
}
