import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ImageCompressTool } from "@/components/tools/image-compress-tool";

export const metadata = toolMetadata("image-compress");

export default function Page() {
  return (
    <ToolPage toolId="image-compress" wide>
      <ImageCompressTool />
    </ToolPage>
  );
}
