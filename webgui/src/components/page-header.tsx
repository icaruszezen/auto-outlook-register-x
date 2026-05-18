"use client";

import { usePathname } from "next/navigation";
import { ConnectionStatus } from "@/components/connection-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageTitleFromPath } from "@/components/sidebar";

export function PageHeader() {
  const pathname = usePathname();
  const title = pageTitleFromPath(pathname) || "OutlookRegister";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      <h1 className="text-sm font-medium tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <ConnectionStatus />
        <ThemeToggle />
      </div>
    </header>
  );
}
