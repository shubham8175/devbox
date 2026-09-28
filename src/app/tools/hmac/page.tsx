import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HmacTool } from "@/components/tools/hmac-tool";

export const metadata = toolMetadata("hmac");

export default function Page() {
  return (
    <ToolPage toolId="hmac">
      <HmacTool />
    </ToolPage>
  );
}
