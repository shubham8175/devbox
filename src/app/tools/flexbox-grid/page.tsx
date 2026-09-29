import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { FlexboxGridTool } from "@/components/tools/flexbox-grid-tool";

export const metadata = toolMetadata("flexbox-grid");

export default function Page() {
  return (
    <ToolPage toolId="flexbox-grid" wide>
      <FlexboxGridTool />
    </ToolPage>
  );
}
