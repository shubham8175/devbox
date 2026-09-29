import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { YamlLintTool } from "@/components/tools/yaml-lint-tool";

export const metadata = toolMetadata("yaml-lint");

export default function Page() {
  return (
    <ToolPage toolId="yaml-lint" wide>
      <YamlLintTool />
    </ToolPage>
  );
}
