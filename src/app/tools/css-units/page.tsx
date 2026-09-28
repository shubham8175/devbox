import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CssUnitsTool } from "@/components/tools/css-units-tool";

export const metadata = toolMetadata("css-units");

export default function Page() {
  return (
    <ToolPage toolId="css-units">
      <CssUnitsTool />
    </ToolPage>
  );
}
