import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SqlTool } from "@/components/tools/sql-tool";

export const metadata = toolMetadata("sql");

export default function Page() {
  return (
    <ToolPage toolId="sql" wide>
      <SqlTool />
    </ToolPage>
  );
}
