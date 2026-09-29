import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { IpLookupTool } from "@/components/tools/ip-lookup-tool";

export const metadata = toolMetadata("ip-lookup");

export default function Page() {
  return (
    <ToolPage toolId="ip-lookup">
      <IpLookupTool />
    </ToolPage>
  );
}
