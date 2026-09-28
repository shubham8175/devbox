import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { EnvValidatorTool } from "@/components/tools/env-validator-tool";

export const metadata = toolMetadata("env-validator");

export default function Page() {
  return (
    <ToolPage toolId="env-validator">
      <EnvValidatorTool />
    </ToolPage>
  );
}
