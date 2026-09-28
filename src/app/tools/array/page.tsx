import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ArrayTool } from "@/components/tools/array-tool";

export const metadata = toolMetadata("array");

export default function Page() {
  return (
    <ToolPage toolId="array" wide>
      <ArrayTool />
    </ToolPage>
  );
}
