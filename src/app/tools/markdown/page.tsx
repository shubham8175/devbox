import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MarkdownTool } from "@/components/tools/markdown-tool";

export const metadata = toolMetadata("markdown");

export default function Page() {
  return (
    <ToolPage toolId="markdown" wide>
      <MarkdownTool />
    </ToolPage>
  );
}
