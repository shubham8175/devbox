import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonSchemaTool } from "@/components/tools/json-schema-tool";

export const metadata = toolMetadata("json-schema");

export default function Page() {
  return (
    <ToolPage toolId="json-schema" wide>
      <JsonSchemaTool />
    </ToolPage>
  );
}
