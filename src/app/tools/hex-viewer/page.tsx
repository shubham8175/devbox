import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HexViewerTool } from "@/components/tools/hex-viewer-tool";

export const metadata = toolMetadata("hex-viewer");

export default function Page() {
  return (
    <ToolPage toolId="hex-viewer" wide>
      <HexViewerTool />
    </ToolPage>
  );
}
