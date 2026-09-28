import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { GitDiffTool } from "@/components/tools/git-diff-tool";

export const metadata = toolMetadata("git-diff");

export default function Page() {
  return (
    <ToolPage toolId="git-diff" wide>
      <GitDiffTool />
    </ToolPage>
  );
}
