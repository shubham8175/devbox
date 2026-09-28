import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { EpochTool } from "@/components/tools/epoch-tool";

export const metadata = toolMetadata("epoch");

export default function Page() {
  return (
    <ToolPage toolId="epoch">
      <EpochTool />
    </ToolPage>
  );
}
