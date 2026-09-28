import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CurlTool } from "@/components/tools/curl-tool";

export const metadata = toolMetadata("curl");

export default function Page() {
  return (
    <ToolPage toolId="curl">
      <CurlTool />
    </ToolPage>
  );
}
