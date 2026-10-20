import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BookOpen, LayoutDashboard, Library, Tags, Users, LogOut, Menu, ShieldCheck, CalendarDays, Layers, CreditCard, Percent, MessageSquareWarning, LifeBuoy, Settings, UserCog, Receipt, ChevronDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { to: "/analytics", label: "Reading analytics", icon: TrendingUp }] },
  {
    label: "Content",
    items: [
      { to: "/books", label: "Books & chapters", icon: Library },
      { to: "/series", label: "Series", icon: Layers },
      { to: "/genres", label: "Genres", icon: Tags },
      { to: "/authors", label: "Authors", icon: Users },
      { to: "/calendar", label: "Publishing calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/orders", label: "Orders & payments", icon: Receipt },
      { to: "/subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/promotions", label: "Promotions", icon: Percent },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "/moderation", label: "Reviews & moderation", icon: MessageSquareWarning },
      { to: "/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/staff", label: "Staff & roles", icon: UserCog },
      { to: "/audit", label: "Audit log", icon: ShieldCheck },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export function AdminShell() {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeGroup = groups.find((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)))?.label;
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2 px-2 py-1">
        <BookOpen className="h-5 w-5 text-sidebar-primary" />
        <span className="font-semibold text-sidebar-accent-foreground">Hawwii Admin</span>
      </div>
      {groups.map((g) => {
        const isOpen = openGroups[g.label] ?? false;
        return (
          <div key={g.label}>
            <button
              onClick={() => setOpenGroups((prev) => ({ ...prev, [g.label]: !isOpen }))}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium hover:bg-sidebar-accent",
                activeGroup === g.label && "text-sidebar-accent-foreground",
              )}
              aria-expanded={isOpen}
            >
              <span className="flex-1 text-left uppercase tracking-wider text-xs opacity-70">{g.label}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="mt-1 space-y-0.5 pl-2">
                {g.items.map((i) => (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent"
                    activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                  >
                    <i.icon className="h-4 w-4" /> {i.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-auto space-y-2 pt-4">
        <div className="flex flex-wrap gap-1 px-2">
          {roles.length ? roles.map((r) => <Badge key={r} variant="secondary">{r.replace("_", " ")}</Badge>) : <span className="text-xs opacity-60">No staff role</span>}
        </div>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 bg-sidebar text-sidebar-foreground md:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Hawwii Admin</span>
        </header>
        <main className={cn("mx-auto w-full max-w-6xl flex-1 p-4 md:p-8")}>
          {roles.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <h1 className="text-lg font-semibold">Waiting for access</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your account has no staff role yet. Ask an administrator to grant you one.</p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    published: "bg-success/15 text-success",
    scheduled: "bg-primary/10 text-primary",
    in_review: "bg-warning/20 text-foreground",
    draft: "bg-muted text-muted-foreground",
    unpublished: "bg-muted text-muted-foreground",
    archived: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone[status] ?? "bg-muted")}>{status.replace("_", " ")}</span>;
}
