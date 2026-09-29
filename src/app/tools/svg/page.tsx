import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SvgTool } from "@/components/tools/svg-tool";

export const metadata = toolMetadata("svg");

export default function Page() {
  return (
    <ToolPage toolId="svg" wide>
      <SvgTool />
    </ToolPage>
  );
}
