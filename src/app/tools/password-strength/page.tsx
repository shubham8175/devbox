import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { PasswordStrengthTool } from "@/components/tools/password-strength-tool";

export const metadata = toolMetadata("password-strength");

export default function Page() {
  return (
    <ToolPage toolId="password-strength">
      <PasswordStrengthTool />
    </ToolPage>
  );
}
