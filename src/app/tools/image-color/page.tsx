import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageColorTool } from "@/components/tools/image-color-tool";

export const metadata = toolMetadata("image-color");

export default function Page() {
  return (
    <ToolPage toolId="image-color" wide>
      <ImageColorTool />
    </ToolPage>
  );
}
