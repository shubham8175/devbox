import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SlugTool } from "@/components/tools/slug-tool";

export const metadata = toolMetadata("slug");

export default function Page() {
  return (
    <ToolPage toolId="slug">
      <SlugTool />
    </ToolPage>
  );
}
