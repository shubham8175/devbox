import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { TailwindCssTool } from "@/components/tools/tailwind-css-tool";

export const metadata = toolMetadata("tailwind-css");

export default function Page() {
  return (
    <ToolPage toolId="tailwind-css">
      <TailwindCssTool />
    </ToolPage>
  );
}
