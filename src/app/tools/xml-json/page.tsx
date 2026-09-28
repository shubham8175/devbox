import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { XmlJsonTool } from "@/components/tools/xml-json-tool";

export const metadata = toolMetadata("xml-json");

export default function Page() {
  return (
    <ToolPage toolId="xml-json" wide>
      <XmlJsonTool />
    </ToolPage>
  );
}
