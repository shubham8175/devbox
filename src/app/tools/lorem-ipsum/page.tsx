import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { LoremIpsumTool } from "@/components/tools/lorem-ipsum-tool";

export const metadata = toolMetadata("lorem-ipsum");

export default function Page() {
  return (
    <ToolPage toolId="lorem-ipsum">
      <LoremIpsumTool />
    </ToolPage>
  );
}
