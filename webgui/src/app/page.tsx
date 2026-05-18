"use client";

import useSWR from "swr";
import { apiGet, API_BASE, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HealthResponse = {
  status: string;
  version: string;
};

type AppInfoResponse = {
  name: string;
  version: string;
  data_dir: string;
};

export default function Home() {
  const health = useSWR<HealthResponse>(
    "/api/health",
    (path: string) => apiGet<HealthResponse>(path),
    { refreshInterval: 5000, shouldRetryOnError: true },
  );

  const appInfo = useSWR<AppInfoResponse>("/api/app-info", (path: string) =>
    apiGet<AppInfoResponse>(path),
  );

  const healthErr = health.error as ApiError | Error | undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            OutlookRegister
          </h1>
          <p className="text-sm text-muted-foreground">
            Backend at <code className="font-mono text-xs">{API_BASE}</code>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            health.mutate();
            appInfo.mutate();
          }}
        >
          Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Health
            {health.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : healthErr ? (
              <Badge variant="destructive">error</Badge>
            ) : health.data ? (
              <Badge>{health.data.status}</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>GET /api/health</CardDescription>
        </CardHeader>
        <CardContent>
          {healthErr ? (
            <p className="text-sm text-destructive">
              {healthErr.message ?? "request failed"}
            </p>
          ) : health.data ? (
            <p className="text-sm">
              version <span className="font-mono">{health.data.version}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">connecting…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>App info</CardTitle>
          <CardDescription>GET /api/app-info</CardDescription>
        </CardHeader>
        <CardContent>
          {appInfo.error ? (
            <p className="text-sm text-destructive">
              {(appInfo.error as Error).message}
            </p>
          ) : appInfo.data ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">name</dt>
              <dd className="font-mono">{appInfo.data.name}</dd>
              <dt className="text-muted-foreground">version</dt>
              <dd className="font-mono">{appInfo.data.version}</dd>
              <dt className="text-muted-foreground">data dir</dt>
              <dd className="font-mono break-all">{appInfo.data.data_dir}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">loading…</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
