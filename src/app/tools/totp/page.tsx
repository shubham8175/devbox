import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TotpTool } from "@/components/tools/totp-tool";

export const metadata = toolMetadata("totp");

export default function Page() {
  return (
    <ToolPage toolId="totp">
      <TotpTool />
    </ToolPage>
  );
}
