import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CronTool } from "@/components/tools/cron-tool";

export const metadata = toolMetadata("cron");

export default function Page() {
  return (
    <ToolPage toolId="cron">
      <CronTool />
    </ToolPage>
  );
}
