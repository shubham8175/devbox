import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageBase64Tool } from "@/components/tools/image-base64-tool";

export const metadata = toolMetadata("image-base64");

export default function Page() {
  return (
    <ToolPage toolId="image-base64">
      <ImageBase64Tool />
    </ToolPage>
  );
}
