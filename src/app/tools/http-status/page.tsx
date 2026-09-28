import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HttpStatusTool } from "@/components/tools/http-status-tool";

export const metadata = toolMetadata("http-status");

export default function Page() {
  return (
    <ToolPage toolId="http-status">
      <HttpStatusTool />
    </ToolPage>
  );
}
