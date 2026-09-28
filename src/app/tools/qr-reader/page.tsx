import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { QrReaderTool } from "@/components/tools/qr-reader-tool";

export const metadata = toolMetadata("qr-reader");

export default function Page() {
  return (
    <ToolPage toolId="qr-reader">
      <QrReaderTool />
    </ToolPage>
  );
}
