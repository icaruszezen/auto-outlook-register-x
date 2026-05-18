import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { PageHeader } from "@/components/page-header";
import { StatusBar } from "@/components/status-bar";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto h-full w-full max-w-6xl p-6">{children}</div>
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
