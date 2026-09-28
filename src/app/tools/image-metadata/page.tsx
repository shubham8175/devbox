import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageMetadataTool } from "@/components/tools/image-metadata-tool";

export const metadata = toolMetadata("image-metadata");

export default function Page() {
  return (
    <ToolPage toolId="image-metadata">
      <ImageMetadataTool />
    </ToolPage>
  );
}
