import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { RegexTool } from "@/components/tools/regex-tool";

export const metadata = toolMetadata("regex");

export default function Page() {
  return (
    <ToolPage toolId="regex">
      <RegexTool />
    </ToolPage>
  );
}
