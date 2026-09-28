import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { NpmRangeTool } from "@/components/tools/npm-range-tool";

export const metadata = toolMetadata("npm-range");

export default function Page() {
  return (
    <ToolPage toolId="npm-range">
      <NpmRangeTool />
    </ToolPage>
  );
}
