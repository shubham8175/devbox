import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TextDiffTool } from "@/components/tools/text-diff-tool";

export const metadata = toolMetadata("text-diff");

export default function Page() {
  return (
    <ToolPage toolId="text-diff" wide>
      <TextDiffTool />
    </ToolPage>
  );
}
