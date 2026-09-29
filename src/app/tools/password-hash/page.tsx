import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { PasswordHashTool } from "@/components/tools/password-hash-tool";

export const metadata = toolMetadata("password-hash");

export default function Page() {
  return (
    <ToolPage toolId="password-hash" wide>
      <PasswordHashTool />
    </ToolPage>
  );
}
