import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Publishing calendar — Hawwii Admin" }, { name: "description", content: "Scheduled and published releases by month." }, { property: "og:title", content: "Publishing calendar — Hawwii Admin" }, { property: "og:description", content: "Scheduled and published releases by month." }] }),
  component: CalendarPage,
});

type Item = { key: string; date: Date; label: string; bookId: string; chapterId?: string; kind: "book" | "chapter"; upcoming: boolean };

function CalendarPage() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = month.toISOString();
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

  const { data: items = [] } = useQuery({
    queryKey: ["calendar", start],
    queryFn: async () => {
      const [b, c] = await Promise.all([
        supabase.from("books").select("id,title,status,scheduled_at,published_at").or(`and(scheduled_at.gte.${start},scheduled_at.lt.${end}),and(published_at.gte.${start},published_at.lt.${end})`),
        supabase.from("chapters").select("id,title,number,book_id,status,scheduled_at,published_at,books(title)").or(`and(scheduled_at.gte.${start},scheduled_at.lt.${end}),and(published_at.gte.${start},published_at.lt.${end})`),
      ]);
      const out: Item[] = [];
      const now = new Date();
      for (const x of b.data ?? []) {
        const d = new Date((x.status === "scheduled" ? x.scheduled_at : x.published_at) ?? x.scheduled_at!);
        out.push({ key: `b${x.id}`, date: d, label: x.title, bookId: x.id, kind: "book", upcoming: d > now });
      }
      for (const x of c.data ?? []) {
        const d = new Date((x.status === "scheduled" ? x.scheduled_at : x.published_at) ?? x.scheduled_at!);
        out.push({ key: `c${x.id}`, date: d, label: `${x.books?.title ?? ""} · Ch ${x.number}`, bookId: x.book_id, chapterId: x.id, kind: "chapter", upcoming: d > now });
      }
      return out;
    },
  });

  const firstDay = (month.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, i) => i - firstDay + 1);
  const today = new Date();

  return (
    <>
      <PageHeader
        title="Publishing calendar"
        description="Scheduled releases go live automatically at their set time."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-36 text-center font-medium">{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</span>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted text-center text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const inMonth = day >= 1 && day <= days;
            const dayItems = inMonth ? items.filter((it) => it.date.getDate() === day) : [];
            const isToday = inMonth && today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth() && today.getDate() === day;
            return (
              <div key={i} className={cn("min-h-24 border-b border-r p-1.5", !inMonth && "bg-muted/40")}>
                {inMonth && <p className={cn("mb-1 text-xs", isToday && "font-bold text-primary")}>{day}</p>}
                <div className="space-y-1">
                  {dayItems.map((it) => (
                    <Link
                      key={it.key}
                      to={it.chapterId ? "/books/$id/chapters/$chapterId" : "/books/$id"}
                      params={it.chapterId ? { id: it.bookId, chapterId: it.chapterId } : { id: it.bookId }}
                      className={cn("block truncate rounded px-1.5 py-0.5 text-xs", it.upcoming ? "bg-primary/10 text-primary" : "bg-success/15 text-success")}
                      title={`${it.label} — ${it.date.toLocaleString()}`}
                    >
                      {it.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" /> Upcoming <span className="ml-4 mr-1 inline-block h-2 w-2 rounded-full bg-success" /> Live</p>
    </>
  );
}
