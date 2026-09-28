import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { AppIconsTool } from "@/components/tools/app-icons-tool";

export const metadata = toolMetadata("app-icons");

export default function Page() {
  return (
    <ToolPage toolId="app-icons" wide>
      <AppIconsTool />
    </ToolPage>
  );
}
