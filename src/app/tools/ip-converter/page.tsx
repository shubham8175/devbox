import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { IpConverterTool } from "@/components/tools/ip-converter-tool";

export const metadata = toolMetadata("ip-converter");

export default function Page() {
  return (
    <ToolPage toolId="ip-converter">
      <IpConverterTool />
    </ToolPage>
  );
}
