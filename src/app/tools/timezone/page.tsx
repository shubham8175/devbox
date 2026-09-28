import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TimezoneTool } from "@/components/tools/timezone-tool";

export const metadata = toolMetadata("timezone");

export default function Page() {
  return (
    <ToolPage toolId="timezone">
      <TimezoneTool />
    </ToolPage>
  );
}
