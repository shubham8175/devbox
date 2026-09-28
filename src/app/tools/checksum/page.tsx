import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ChecksumTool } from "@/components/tools/checksum-tool";

export const metadata = toolMetadata("checksum");

export default function Page() {
  return (
    <ToolPage toolId="checksum">
      <ChecksumTool />
    </ToolPage>
  );
}
