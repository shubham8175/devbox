import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { HtmlEntitiesTool } from "@/components/tools/html-entities-tool";

export const metadata = toolMetadata("html-entities");

export default function Page() {
  return (
    <ToolPage toolId="html-entities">
      <HtmlEntitiesTool />
    </ToolPage>
  );
}
