import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { StringCaseTool } from "@/components/tools/string-case-tool";

export const metadata = toolMetadata("string-case");

export default function Page() {
  return (
    <ToolPage toolId="string-case">
      <StringCaseTool />
    </ToolPage>
  );
}
