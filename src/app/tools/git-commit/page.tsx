import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { GitCommitTool } from "@/components/tools/git-commit-tool";

export const metadata = toolMetadata("git-commit");

export default function Page() {
  return (
    <ToolPage toolId="git-commit">
      <GitCommitTool />
    </ToolPage>
  );
}
