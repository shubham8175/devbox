import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { UserAgentTool } from "@/components/tools/user-agent-tool";

export const metadata = toolMetadata("user-agent");

export default function Page() {
  return (
    <ToolPage toolId="user-agent">
      <UserAgentTool />
    </ToolPage>
  );
}
