import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CommandsTool } from "@/components/tools/commands-tool";

export const metadata = toolMetadata("commands");

export default function Page() {
  return (
    <ToolPage toolId="commands">
      <CommandsTool />
    </ToolPage>
  );
}
