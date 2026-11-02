import type { ReactNode } from "react";
import { guardPage } from "@/lib/auth";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardPage();
  return <Shell>{children}</Shell>;
}
