import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CsvJsonTool } from "@/components/tools/csv-json-tool";

export const metadata = toolMetadata("csv-json");

export default function Page() {
  return (
    <ToolPage toolId="csv-json" wide>
      <CsvJsonTool />
    </ToolPage>
  );
}
