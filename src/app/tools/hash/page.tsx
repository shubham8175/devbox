import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HashTool } from "@/components/tools/hash-tool";

export const metadata = toolMetadata("hash");

export default function Page() {
  return (
    <ToolPage toolId="hash">
      <HashTool />
    </ToolPage>
  );
}
