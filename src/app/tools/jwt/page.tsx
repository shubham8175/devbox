import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JwtTool } from "@/components/tools/jwt-tool";

export const metadata = toolMetadata("jwt");

export default function Page() {
  return (
    <ToolPage toolId="jwt">
      <JwtTool />
    </ToolPage>
  );
}
