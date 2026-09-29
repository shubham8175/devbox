import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { MimeTypesTool } from "@/components/tools/mime-types-tool";

export const metadata = toolMetadata("mime-types");

export default function Page() {
  return (
    <ToolPage toolId="mime-types">
      <MimeTypesTool />
    </ToolPage>
  );
}
