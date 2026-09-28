import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { PermissionsTool } from "@/components/tools/permissions-tool";

export const metadata = toolMetadata("permissions");

export default function Page() {
  return (
    <ToolPage toolId="permissions">
      <PermissionsTool />
    </ToolPage>
  );
}
