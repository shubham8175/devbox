import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonTool } from "@/components/tools/json-tool";

export const metadata = toolMetadata("json");

export default function Page() {
  return (
    <ToolPage toolId="json">
      <JsonTool />
    </ToolPage>
  );
}
