import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonPatchTool } from "@/components/tools/json-patch-tool";

export const metadata = toolMetadata("json-patch");

export default function Page() {
  return (
    <ToolPage toolId="json-patch" wide>
      <JsonPatchTool />
    </ToolPage>
  );
}
