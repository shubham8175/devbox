import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { UnitConverterTool } from "@/components/tools/unit-converter-tool";

export const metadata = toolMetadata("unit-converter");

export default function Page() {
  return (
    <ToolPage toolId="unit-converter">
      <UnitConverterTool />
    </ToolPage>
  );
}
