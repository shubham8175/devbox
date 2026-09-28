import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { Base64Tool } from "@/components/tools/base64-tool";

export const metadata = toolMetadata("base64");

export default function Page() {
  return (
    <ToolPage toolId="base64">
      <Base64Tool />
    </ToolPage>
  );
}
