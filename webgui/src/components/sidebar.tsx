"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  CircleHelp,
  CreditCard,
  Database,
  FileText,
  Layers,
  Mail,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLeaf = {
  type: "leaf";
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  type: "group";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  basePath: string;
  children: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
};

type NavItem = NavLeaf | NavGroup;

const NAV: NavItem[] = [
  { type: "leaf", label: "自动注册", href: "/register", icon: UserPlus },
  { type: "leaf", label: "邮件监听", href: "/monitor", icon: Mail },
  { type: "leaf", label: "账号管理", href: "/accounts", icon: Users },
  {
    type: "group",
    label: "数据管理",
    icon: Database,
    basePath: "/data",
    children: [
      { label: "Augment Token", href: "/data/augment", icon: Layers },
      { label: "邮箱数据", href: "/data/emails", icon: Mail },
      { label: "用户数据", href: "/data/users", icon: Users },
      { label: "卡密数据", href: "/data/cards", icon: CreditCard },
    ],
  },
  { type: "leaf", label: "关于", href: "/about", icon: CircleHelp },
];

export const NAV_LABELS: Record<string, string> = {
  "/register": "自动注册",
  "/monitor": "邮件监听",
  "/accounts": "账号管理",
  "/about": "关于",
  "/data/augment": "Augment Token",
  "/data/emails": "邮箱数据",
  "/data/users": "用户数据",
  "/data/cards": "卡密数据",
};

export function pageTitleFromPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  if (NAV_LABELS[pathname]) return NAV_LABELS[pathname];
  for (const item of NAV) {
    if (item.type === "leaf" && pathname.startsWith(item.href)) return item.label;
    if (item.type === "group") {
      for (const child of item.children) {
        if (pathname.startsWith(child.href)) return child.label;
      }
    }
  }
  return "";
}

function isActiveLeaf(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
          OR
        </div>
        <span className="text-sm font-semibold tracking-tight">OutlookRegister</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            if (item.type === "leaf") {
              const Icon = item.icon;
              const active = isActiveLeaf(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            }

            const GroupIcon = item.icon;
            const groupActive = pathname.startsWith(item.basePath);
            return (
              <li key={item.basePath} className="pt-1">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm",
                    groupActive
                      ? "text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80",
                  )}
                >
                  <GroupIcon className="size-4" />
                  {item.label}
                  <ChevronRight
                    className={cn(
                      "ml-auto size-3.5 transition-transform",
                      groupActive ? "rotate-90 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </div>
                <ul className="mt-0.5 space-y-0.5 border-l border-sidebar-border ml-4 pl-2">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const active = isActiveLeaf(pathname, child.href);
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <ChildIcon className="size-3.5" />
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        <FileText className="mr-1 inline size-3 align-[-2px]" />
        本地数据 · 离线运行
      </div>
    </aside>
  );
}
