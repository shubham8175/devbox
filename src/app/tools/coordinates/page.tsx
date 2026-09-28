import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CoordinatesTool } from "@/components/tools/coordinates-tool";

export const metadata = toolMetadata("coordinates");

export default function Page() {
  return (
    <ToolPage toolId="coordinates">
      <CoordinatesTool />
    </ToolPage>
  );
}
