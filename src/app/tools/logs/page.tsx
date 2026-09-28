import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { LogsTool } from "@/components/tools/logs-tool";

export const metadata = toolMetadata("logs");

export default function Page() {
  return (
    <ToolPage toolId="logs" wide>
      <LogsTool />
    </ToolPage>
  );
}
