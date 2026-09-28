import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ObjectIdTool } from "@/components/tools/objectid-tool";

export const metadata = toolMetadata("objectid");

export default function Page() {
  return (
    <ToolPage toolId="objectid">
      <ObjectIdTool />
    </ToolPage>
  );
}
