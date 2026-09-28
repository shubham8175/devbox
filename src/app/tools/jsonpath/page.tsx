import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonpathTool } from "@/components/tools/jsonpath-tool";

export const metadata = toolMetadata("jsonpath");

export default function Page() {
  return (
    <ToolPage toolId="jsonpath">
      <JsonpathTool />
    </ToolPage>
  );
}
