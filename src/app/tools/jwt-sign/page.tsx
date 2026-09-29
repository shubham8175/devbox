import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JwtSignTool } from "@/components/tools/jwt-sign-tool";

export const metadata = toolMetadata("jwt-sign");

export default function Page() {
  return (
    <ToolPage toolId="jwt-sign" wide>
      <JwtSignTool />
    </ToolPage>
  );
}
