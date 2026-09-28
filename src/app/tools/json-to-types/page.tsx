import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonToTypesTool } from "@/components/tools/json-to-types-tool";

export const metadata = toolMetadata("json-to-types");

export default function Page() {
  return (
    <ToolPage toolId="json-to-types" wide>
      <JsonToTypesTool />
    </ToolPage>
  );
}
