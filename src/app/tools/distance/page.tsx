import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { DistanceTool } from "@/components/tools/distance-tool";

export const metadata = toolMetadata("distance");

export default function Page() {
  return (
    <ToolPage toolId="distance">
      <DistanceTool />
    </ToolPage>
  );
}
