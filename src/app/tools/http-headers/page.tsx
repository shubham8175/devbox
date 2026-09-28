import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HttpHeadersTool } from "@/components/tools/http-headers-tool";

export const metadata = toolMetadata("http-headers");

export default function Page() {
  return (
    <ToolPage toolId="http-headers" wide>
      <HttpHeadersTool />
    </ToolPage>
  );
}
