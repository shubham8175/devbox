import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { BaseConverterTool } from "@/components/tools/base-converter-tool";

export const metadata = toolMetadata("base-converter");

export default function Page() {
  return (
    <ToolPage toolId="base-converter">
      <BaseConverterTool />
    </ToolPage>
  );
}
