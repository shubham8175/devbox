import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MockDataTool } from "@/components/tools/mock-data-tool";

export const metadata = toolMetadata("mock-data");

export default function Page() {
  return (
    <ToolPage toolId="mock-data">
      <MockDataTool />
    </ToolPage>
  );
}
