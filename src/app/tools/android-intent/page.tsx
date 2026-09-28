import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { AndroidIntentTool } from "@/components/tools/android-intent-tool";

export const metadata = toolMetadata("android-intent");

export default function Page() {
  return (
    <ToolPage toolId="android-intent">
      <AndroidIntentTool />
    </ToolPage>
  );
}
