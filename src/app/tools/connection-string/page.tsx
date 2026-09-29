import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ConnectionStringTool } from "@/components/tools/connection-string-tool";

export const metadata = toolMetadata("connection-string");

export default function Page() {
  return (
    <ToolPage toolId="connection-string">
      <ConnectionStringTool />
    </ToolPage>
  );
}
