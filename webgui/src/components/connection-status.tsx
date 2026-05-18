"use client";

import useSWR from "swr";
import { apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type HealthResponse = {
  status: string;
  version: string;
};

export function ConnectionStatus({ className }: { className?: string }) {
  const { data, error, isLoading } = useSWR<HealthResponse>(
    "/api/health",
    (path: string) => apiGet<HealthResponse>(path),
    {
      refreshInterval: 5000,
      shouldRetryOnError: true,
      revalidateOnFocus: false,
      dedupingInterval: 1000,
    },
  );

  const connected = !error && !!data;
  const errMsg = (error as ApiError | Error | undefined)?.message;

  return (
    <div
      className={cn("flex items-center gap-2 text-sm", className)}
      title={errMsg ?? (data ? `${data.status} ${data.version}` : "")}
    >
      <span
        className={cn(
          "inline-block size-2.5 rounded-full",
          connected ? "bg-emerald-500" : "bg-red-500",
          isLoading && "animate-pulse",
        )}
      />
      <span className="text-muted-foreground">
        {connected ? `已连接 v${data.version}` : "连接断开"}
      </span>
    </div>
  );
}
