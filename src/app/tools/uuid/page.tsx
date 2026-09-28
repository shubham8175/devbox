import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { UuidTool } from "@/components/tools/uuid-tool";

export const metadata = toolMetadata("uuid");

export default function Page() {
  return (
    <ToolPage toolId="uuid">
      <UuidTool />
    </ToolPage>
  );
}
