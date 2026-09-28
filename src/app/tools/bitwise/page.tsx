import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { BitwiseTool } from "@/components/tools/bitwise-tool";

export const metadata = toolMetadata("bitwise");

export default function Page() {
  return (
    <ToolPage toolId="bitwise">
      <BitwiseTool />
    </ToolPage>
  );
}
