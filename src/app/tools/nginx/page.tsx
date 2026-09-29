import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { NginxTool } from "@/components/tools/nginx-tool";

export const metadata = toolMetadata("nginx");

export default function Page() {
  return (
    <ToolPage toolId="nginx" wide>
      <NginxTool />
    </ToolPage>
  );
}
