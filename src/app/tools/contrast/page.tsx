import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ContrastTool } from "@/components/tools/contrast-tool";

export const metadata = toolMetadata("contrast");

export default function Page() {
  return (
    <ToolPage toolId="contrast">
      <ContrastTool />
    </ToolPage>
  );
}
