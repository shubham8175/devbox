import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { DeviceInfoTool } from "@/components/tools/device-info-tool";

export const metadata = toolMetadata("device-info");

export default function Page() {
  return (
    <ToolPage toolId="device-info">
      <DeviceInfoTool />
    </ToolPage>
  );
}
