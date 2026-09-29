import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { OpenapiTool } from "@/components/tools/openapi-tool";

export const metadata = toolMetadata("openapi");

export default function Page() {
  return (
    <ToolPage toolId="openapi" wide>
      <OpenapiTool />
    </ToolPage>
  );
}
