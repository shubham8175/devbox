import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SqlToOrmTool } from "@/components/tools/sql-to-orm-tool";

export const metadata = toolMetadata("sql-to-orm");

export default function Page() {
  return (
    <ToolPage toolId="sql-to-orm">
      <SqlToOrmTool />
    </ToolPage>
  );
}
