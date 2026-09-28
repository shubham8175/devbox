import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { EscapeTool } from "@/components/tools/escape-tool";

export const metadata = toolMetadata("escape");

export default function Page() {
  return (
    <ToolPage toolId="escape">
      <EscapeTool />
    </ToolPage>
  );
}
