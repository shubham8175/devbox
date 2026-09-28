import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { EnvDiffTool } from "@/components/tools/env-diff-tool";

export const metadata = toolMetadata("env-diff");

export default function Page() {
  return (
    <ToolPage toolId="env-diff" wide>
      <EnvDiffTool />
    </ToolPage>
  );
}
