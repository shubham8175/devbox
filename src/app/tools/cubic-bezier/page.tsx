import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CubicBezierTool } from "@/components/tools/cubic-bezier-tool";

export const metadata = toolMetadata("cubic-bezier");

export default function Page() {
  return (
    <ToolPage toolId="cubic-bezier">
      <CubicBezierTool />
    </ToolPage>
  );
}
