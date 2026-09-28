import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { YamlJsonTool } from "@/components/tools/yaml-json-tool";

export const metadata = toolMetadata("yaml-json");

export default function Page() {
  return (
    <ToolPage toolId="yaml-json" wide>
      <YamlJsonTool />
    </ToolPage>
  );
}
