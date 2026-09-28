import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { SemverTool } from "@/components/tools/semver-tool";

export const metadata = toolMetadata("semver");

export default function Page() {
  return (
    <ToolPage toolId="semver">
      <SemverTool />
    </ToolPage>
  );
}
