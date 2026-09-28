import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TaxTool } from "@/components/tools/tax-tool";

export const metadata = toolMetadata("tax");

export default function Page() {
  return (
    <ToolPage toolId="tax">
      <TaxTool />
    </ToolPage>
  );
}
