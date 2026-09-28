import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { BoxShadowTool } from "@/components/tools/box-shadow-tool";

export const metadata = toolMetadata("box-shadow");

export default function Page() {
  return (
    <ToolPage toolId="box-shadow">
      <BoxShadowTool />
    </ToolPage>
  );
}
