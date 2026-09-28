import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TextTool } from "@/components/tools/text-tool";

export const metadata = toolMetadata("text");

export default function Page() {
  return (
    <ToolPage toolId="text" wide>
      <TextTool />
    </ToolPage>
  );
}
