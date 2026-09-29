import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TextStatsTool } from "@/components/tools/text-stats-tool";

export const metadata = toolMetadata("text-stats");

export default function Page() {
  return (
    <ToolPage toolId="text-stats">
      <TextStatsTool />
    </ToolPage>
  );
}
