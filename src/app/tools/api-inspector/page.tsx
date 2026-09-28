import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ApiInspectorTool } from "@/components/tools/api-inspector-tool";

export const metadata = toolMetadata("api-inspector");

export default function Page() {
  return (
    <ToolPage toolId="api-inspector" wide>
      <ApiInspectorTool />
    </ToolPage>
  );
}
