import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startLogin } from "@/const";
import { cn } from "@/lib/utils";
import { CalendarClock, FolderOpen, LayoutList, LogOut, Sparkles, Settings } from "lucide-react";
import { Link, useLocation } from "wouter";
import { EditionSwitcher } from "./EditionSwitcher";

const NAV = [
  { path: "/", label: "總覽", icon: LayoutList },
  { path: "/timeline", label: "時間軸", icon: CalendarClock },
  { path: "/resources", label: "資源", icon: FolderOpen },
  { path: "/ai", label: "AI 諮詢", icon: Sparkles },
  { path: "/settings", label: "設定", icon: Settings },
];

/**
 * Mobile-first app shell: sticky serif masthead, bottom tab bar on phones,
 * inline tabs on wider screens.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background paper-grain">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background paper-grain px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground">
            MARKET PLANNER
          </p>
          <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight">
            創業市集規劃助手
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            四人共用的籌備進度看板。登入後即可看到最新的任務狀態，手機也能直接使用。
          </p>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="mt-8 h-12 w-full text-base tap-target"
          >
            登入開始使用
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background paper-grain">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/" className="min-w-0 shrink-0">
              <span className="font-serif text-base font-bold tracking-tight sm:text-lg">
                咻一下市集
              </span>
            </Link>
            <EditionSwitcher />
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(item => {
              const active = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <span
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors duration-200",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarFallback className="bg-secondary text-xs font-medium">
                    {user.name?.charAt(0).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium">{user.name || "成員"}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {user.email || ""}
                </p>
              </div>
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="container pb-28 pt-6 sm:pb-12">{children}</main>

      {/* Bottom tab bar — phones only, large touch targets */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid grid-cols-5">
          {NAV.map(item => {
            const active = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <span
                  className={cn(
                    "tap-target flex h-16 flex-col items-center justify-center gap-1 text-[0.625rem]",
                    active ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
