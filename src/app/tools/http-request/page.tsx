import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HttpRequestTool } from "@/components/tools/http-request-tool";

export const metadata = toolMetadata("http-request");

export default function Page() {
  return (
    <ToolPage toolId="http-request" wide>
      <HttpRequestTool />
    </ToolPage>
  );
}
