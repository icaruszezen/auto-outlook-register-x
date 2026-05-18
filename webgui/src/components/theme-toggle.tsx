"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="切换主题"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="size-8"
    >
      <Sun className="size-4 scale-100 dark:scale-0 dark:-rotate-90 transition-transform" />
      <Moon className="absolute size-4 scale-0 dark:scale-100 dark:rotate-0 -rotate-90 transition-transform" />
    </Button>
  );
}
