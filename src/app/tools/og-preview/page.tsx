import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { OgPreviewTool } from "@/components/tools/og-preview-tool";

export const metadata = toolMetadata("og-preview");

export default function Page() {
  return (
    <ToolPage toolId="og-preview" wide>
      <OgPreviewTool />
    </ToolPage>
  );
}
