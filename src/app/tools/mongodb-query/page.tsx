import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MongodbQueryTool } from "@/components/tools/mongodb-query-tool";

export const metadata = toolMetadata("mongodb-query");

export default function Page() {
  return (
    <ToolPage toolId="mongodb-query" wide>
      <MongodbQueryTool />
    </ToolPage>
  );
}
