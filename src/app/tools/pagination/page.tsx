import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { PaginationTool } from "@/components/tools/pagination-tool";

export const metadata = toolMetadata("pagination");

export default function Page() {
  return (
    <ToolPage toolId="pagination">
      <PaginationTool />
    </ToolPage>
  );
}
