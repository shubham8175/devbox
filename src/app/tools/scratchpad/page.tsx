import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ScratchpadTool } from "@/components/tools/scratchpad-tool";

export const metadata = toolMetadata("scratchpad");

export default function Page() {
  return (
    <ToolPage toolId="scratchpad" wide>
      <ScratchpadTool />
    </ToolPage>
  );
}
