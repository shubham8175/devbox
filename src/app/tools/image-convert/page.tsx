import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageConvertTool } from "@/components/tools/image-convert-tool";

export const metadata = toolMetadata("image-convert");

export default function Page() {
  return (
    <ToolPage toolId="image-convert">
      <ImageConvertTool />
    </ToolPage>
  );
}
