import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CodeFormatterTool } from "@/components/tools/code-formatter-tool";

export const metadata = toolMetadata("code-formatter");

export default function Page() {
  return (
    <ToolPage toolId="code-formatter" wide>
      <CodeFormatterTool />
    </ToolPage>
  );
}
