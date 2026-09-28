import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { GradientTool } from "@/components/tools/gradient-tool";

export const metadata = toolMetadata("gradient");

export default function Page() {
  return (
    <ToolPage toolId="gradient">
      <GradientTool />
    </ToolPage>
  );
}
