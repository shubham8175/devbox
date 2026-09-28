import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { QrTool } from "@/components/tools/qr-tool";

export const metadata = toolMetadata("qr");

export default function Page() {
  return (
    <ToolPage toolId="qr" wide>
      <QrTool />
    </ToolPage>
  );
}
