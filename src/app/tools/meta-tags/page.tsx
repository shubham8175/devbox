import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MetaTagsTool } from "@/components/tools/meta-tags-tool";

export const metadata = toolMetadata("meta-tags");

export default function Page() {
  return (
    <ToolPage toolId="meta-tags">
      <MetaTagsTool />
    </ToolPage>
  );
}
