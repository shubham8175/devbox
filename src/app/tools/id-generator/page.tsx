import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { IdGeneratorTool } from "@/components/tools/id-generator-tool";

export const metadata = toolMetadata("id-generator");

export default function Page() {
  return (
    <ToolPage toolId="id-generator">
      <IdGeneratorTool />
    </ToolPage>
  );
}
