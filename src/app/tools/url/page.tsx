import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { UrlTool } from "@/components/tools/url-tool";

export const metadata = toolMetadata("url");

export default function Page() {
  return (
    <ToolPage toolId="url">
      <UrlTool />
    </ToolPage>
  );
}
