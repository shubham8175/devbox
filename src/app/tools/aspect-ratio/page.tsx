import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { AspectRatioTool } from "@/components/tools/aspect-ratio-tool";

export const metadata = toolMetadata("aspect-ratio");

export default function Page() {
  return (
    <ToolPage toolId="aspect-ratio">
      <AspectRatioTool />
    </ToolPage>
  );
}
