import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SchemaVisualizerTool } from "@/components/tools/schema-visualizer-tool";

export const metadata = toolMetadata("schema-visualizer");

export default function Page() {
  return (
    <ToolPage toolId="schema-visualizer" wide>
      <SchemaVisualizerTool />
    </ToolPage>
  );
}
