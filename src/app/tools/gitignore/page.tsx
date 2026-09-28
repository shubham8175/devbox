import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { GitignoreTool } from "@/components/tools/gitignore-tool";

export const metadata = toolMetadata("gitignore");

export default function Page() {
  return (
    <ToolPage toolId="gitignore">
      <GitignoreTool />
    </ToolPage>
  );
}
