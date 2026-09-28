import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { FileSizeTool } from "@/components/tools/file-size-tool";

export const metadata = toolMetadata("file-size");

export default function Page() {
  return (
    <ToolPage toolId="file-size">
      <FileSizeTool />
    </ToolPage>
  );
}
