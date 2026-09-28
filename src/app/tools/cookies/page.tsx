import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { CookiesTool } from "@/components/tools/cookies-tool";

export const metadata = toolMetadata("cookies");

export default function Page() {
  return (
    <ToolPage toolId="cookies">
      <CookiesTool />
    </ToolPage>
  );
}
