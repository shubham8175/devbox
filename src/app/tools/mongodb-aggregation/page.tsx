import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MongodbAggregationTool } from "@/components/tools/mongodb-aggregation-tool";

export const metadata = toolMetadata("mongodb-aggregation");

export default function Page() {
  return (
    <ToolPage toolId="mongodb-aggregation">
      <MongodbAggregationTool />
    </ToolPage>
  );
}
