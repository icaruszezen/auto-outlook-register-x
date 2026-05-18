"use client";

import { useAppStore } from "@/lib/store";

export function StatusBar() {
  const statusBar = useAppStore((s) => s.statusBar);
  const last = useAppStore((s) => s.toastHistory[0]);

  const text = statusBar || (last ? last.message : "就绪");
  const timestamp = last ? new Date(last.at) : null;

  return (
    <footer className="flex h-7 items-center justify-between border-t bg-muted/40 px-3 text-[11px] text-muted-foreground">
      <span className="truncate">{text}</span>
      {timestamp ? (
        <span className="ml-2 shrink-0 font-mono text-[10px] tabular-nums">
          {timestamp.toLocaleTimeString()}
        </span>
      ) : null}
    </footer>
  );
}
