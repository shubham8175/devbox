import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CertificateTool } from "@/components/tools/certificate-tool";

export const metadata = toolMetadata("certificate");

export default function Page() {
  return (
    <ToolPage toolId="certificate">
      <CertificateTool />
    </ToolPage>
  );
}
