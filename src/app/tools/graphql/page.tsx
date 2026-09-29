import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { GraphqlTool } from "@/components/tools/graphql-tool";

export const metadata = toolMetadata("graphql");

export default function Page() {
  return (
    <ToolPage toolId="graphql" wide>
      <GraphqlTool />
    </ToolPage>
  );
}
