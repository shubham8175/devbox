import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { ObjectFlattenTool } from "@/components/tools/object-flatten-tool";

export const metadata = toolMetadata("object-flatten");

export default function Page() {
  return (
    <ToolPage toolId="object-flatten" wide>
      <ObjectFlattenTool />
    </ToolPage>
  );
}
