import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { PasswordTool } from "@/components/tools/password-tool";

export const metadata = toolMetadata("password");

export default function Page() {
  return (
    <ToolPage toolId="password">
      <PasswordTool />
    </ToolPage>
  );
}
