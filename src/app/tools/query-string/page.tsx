import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { QueryStringTool } from "@/components/tools/query-string-tool";

export const metadata = toolMetadata("query-string");

export default function Page() {
  return (
    <ToolPage toolId="query-string">
      <QueryStringTool />
    </ToolPage>
  );
}
