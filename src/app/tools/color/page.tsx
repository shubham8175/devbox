import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ColorTool } from "@/components/tools/color-tool";

export const metadata = toolMetadata("color");

export default function Page() {
  return (
    <ToolPage toolId="color">
      <ColorTool />
    </ToolPage>
  );
}
