"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_LINES = 1000;

const PREFIX_STYLES: { prefix: string; className: string }[] = [
  { prefix: "✅", className: "text-emerald-500" },
  { prefix: "⚠️", className: "text-amber-500" },
  { prefix: "❌", className: "text-red-500" },
  { prefix: "🚀", className: "text-sky-500" },
];

function lineClassName(line: string): string {
  for (const { prefix, className } of PREFIX_STYLES) {
    if (line.startsWith(prefix)) return className;
  }
  return "text-foreground/80";
}

export type LogConsoleProps = {
  lines: string[];
  onClear?: () => void;
  className?: string;
  emptyHint?: string;
};

export function LogConsole({ lines, onClear, className, emptyHint }: LogConsoleProps) {
  const trimmed = lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [trimmed.length]);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-md border bg-card text-card-foreground",
        className,
      )}
    >
      {onClear ? (
        <div className="absolute right-2 top-2 z-10">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={trimmed.length === 0}
            className="h-7 px-2 text-xs"
          >
            清空
          </Button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="h-full overflow-auto px-3 py-2 font-mono text-xs leading-5"
      >
        {trimmed.length === 0 ? (
          <p className="text-muted-foreground">{emptyHint ?? "暂无日志"}</p>
        ) : (
          trimmed.map((line, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-words", lineClassName(line))}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
