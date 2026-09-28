import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { WorkflowJsonCsvTool } from "@/components/tools/workflow-json-csv-tool";

export const metadata = toolMetadata("workflow-json-csv");

export default function Page() {
  return (
    <ToolPage toolId="workflow-json-csv" note="A fixed three-step pipeline: parse JSON, select rows with JSONPath, write CSV. Everything runs in your browser and nothing is stored.">
      <WorkflowJsonCsvTool />
    </ToolPage>
  );
}
