import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { DeepLinkTool } from "@/components/tools/deep-link-tool";

export const metadata = toolMetadata("deep-link");

export default function Page() {
  return (
    <ToolPage toolId="deep-link">
      <DeepLinkTool />
    </ToolPage>
  );
}
