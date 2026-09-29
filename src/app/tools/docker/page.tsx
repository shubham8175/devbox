import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { DockerTool } from "@/components/tools/docker-tool";

export const metadata = toolMetadata("docker");

export default function Page() {
  return (
    <ToolPage toolId="docker" wide>
      <DockerTool />
    </ToolPage>
  );
}
