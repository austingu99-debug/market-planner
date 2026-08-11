import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  FolderOpen,
  LayoutList,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  const utils = trpc.useUtils();
  const [location] = useLocation();

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const teamRosterQuery = trpc.auth.teamRoster.useQuery(undefined, {
    enabled: !user,
  });

  const loginMutation = trpc.auth.loginAsMember.useMutation({
    onSuccess: loggedInUser => {
      toast.success(`歡迎回來，${loggedInUser.name || "成員"}！`);
      utils.auth.me.invalidate();
      utils.tasks.list.invalidate();
      utils.editions.active.invalidate();
    },
    onError: err => {
      toast.error(err.message || "登入失敗，請再試一次");
    },
  });

  const handleMemberLogin = (userId?: number, name?: string, email?: string | null) => {
    if (!name?.trim() && !userId) return;
    loginMutation.mutate({
      userId,
      name: name?.trim() || "成員",
      email: email || undefined,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background paper-grain">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!user) {
    const roster = teamRosterQuery.data ?? [];

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background paper-grain px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
          <div className="text-center">
            <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              MARKET PLANNER
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              創業市集規劃助手
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              四人共用的籌備進度看板。請選擇您的團隊身分或輸入姓名進入：
            </p>
          </div>

          {/* Existing Roster Quick Login */}
          {roster.length > 0 && (
            <div className="mt-6 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                選擇團隊成員身分
              </p>
              <div className="grid gap-2">
                {roster.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleMemberLogin(m.id, m.name || undefined, m.email)}
                    disabled={loginMutation.isPending}
                    className="tap-target group flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background px-4 py-3 text-left transition-all hover:border-foreground/40 hover:bg-accent/40 disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                          {m.name?.charAt(0).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {m.name || "未命名成員"}
                        </p>
                        {m.email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {m.email}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                      <span>進入</span>
                      <LogIn className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* New Member Login / Join */}
          <div className="mt-6 border-t border-border/70 pt-6">
            {!showAddForm && roster.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1 flex items-center justify-center gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" />
                以新成員姓名登入 / 加入團隊
              </button>
            ) : (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleMemberLogin(undefined, newName, newEmail);
                }}
                className="space-y-3"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {roster.length > 0 ? "輸入新成員姓名" : "輸入您的姓名開始使用"}
                </p>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="請輸入您的姓名 / 暱稱…"
                  required
                  className="h-11 rounded-xl text-sm"
                  disabled={loginMutation.isPending}
                />
                <Input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="Email（選填，方便辨識）"
                  className="h-11 rounded-xl text-sm"
                  disabled={loginMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={!newName.trim() || loginMutation.isPending}
                  size="lg"
                  className="w-full h-11 text-sm rounded-xl tap-target"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登入中…
                    </>
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-4 w-4" />
                      確認進入看板
                    </>
                  )}
                </Button>
                {roster.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    返回選擇成員
                  </button>
                )}
              </form>
            )}
          </div>
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
                className="cursor-pointer"
              >
                <Users className="mr-2 h-4 w-4" />
                切換成員身分
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive cursor-pointer"
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
