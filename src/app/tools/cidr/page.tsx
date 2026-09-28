import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CidrTool } from "@/components/tools/cidr-tool";

export const metadata = toolMetadata("cidr");

export default function Page() {
  return (
    <ToolPage toolId="cidr">
      <CidrTool />
    </ToolPage>
  );
}
