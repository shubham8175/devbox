import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageResizeTool } from "@/components/tools/image-resize-tool";

export const metadata = toolMetadata("image-resize");

export default function Page() {
  return (
    <ToolPage toolId="image-resize" wide>
      <ImageResizeTool />
    </ToolPage>
  );
}
