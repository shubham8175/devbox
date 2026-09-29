import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CssClampTool } from "@/components/tools/css-clamp-tool";

export const metadata = toolMetadata("css-clamp");

export default function Page() {
  return (
    <ToolPage toolId="css-clamp">
      <CssClampTool />
    </ToolPage>
  );
}
