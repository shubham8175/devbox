import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { KeypairTool } from "@/components/tools/keypair-tool";

export const metadata = toolMetadata("keypair");

export default function Page() {
  return (
    <ToolPage toolId="keypair">
      <KeypairTool />
    </ToolPage>
  );
}
