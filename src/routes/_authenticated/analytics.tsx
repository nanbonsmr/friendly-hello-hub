import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Clock3, Eye, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BookStat = { book_id: string; opens: number; unique_readers: number; completes: number; seconds_read: number; last_event_at: string | null };
type ChapterStat = { chapter_id: string; book_id: string; opens: number; unique_readers: number; completes: number };

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Reading analytics — Hawwii Admin" }, { name: "description", content: "See what readers open, finish and how long they read." }, { property: "og:title", content: "Reading analytics — Hawwii Admin" }, { property: "og:description", content: "See what readers open, finish and how long they read." }] }),
  component: AnalyticsPage,
});

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function hours(seconds: number) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.round(seconds / 60)} min`;
}

function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reading-analytics"],
    queryFn: async () => {
      const [overall, bookStats, books, chapterStats, chapters] = await Promise.all([
        supabase.from("overall_reading_stats").select("*").maybeSingle(),
        supabase.from("book_reading_stats").select("*"),
        supabase.from("books").select("id,title"),
        supabase.from("chapter_reading_stats").select("*"),
        supabase.from("chapters").select("id,title,book_id"),
      ]);
      if (bookStats.error) throw bookStats.error;
      if (chapterStats.error) throw chapterStats.error;
      const bookTitles = new Map((books.data ?? []).map((b) => [b.id, b.title]));
      const chapterInfo = new Map((chapters.data ?? []).map((c) => [c.id, { title: c.title, book: bookTitles.get(c.book_id) ?? "—" }]));
      const topBooks = ((bookStats.data ?? []) as BookStat[]).filter((b) => b.opens > 0).sort((a, b) => b.opens - a.opens);
      const topChapters = ((chapterStats.data ?? []) as ChapterStat[]).filter((c) => c.opens > 0).sort((a, b) => b.opens - a.opens);
      return { overall: overall.data, topBooks, topChapters, chapterInfo };
    },
  });

  const o = data?.overall;
  const stats = [
    { label: "Unique readers", value: isLoading ? "…" : o?.unique_readers ?? 0, icon: Users },
    { label: "Chapter opens", value: isLoading ? "…" : o?.opens ?? 0, icon: Eye },
    { label: "Completions", value: isLoading ? "…" : o?.completes ?? 0, icon: CheckCircle2 },
    { label: "Time read", value: isLoading ? "…" : hours(o?.seconds_read ?? 0), icon: Clock3 },
  ];

  return (
    <>
      <PageHeader title="Reading analytics" description="What readers open, finish and how long they read." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-5">
              <div className="rounded-lg bg-primary/10 p-2.5"><s.icon className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && (data?.topBooks.length ?? 0) === 0 && (
        <Card className="mt-6">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No reading data yet. Numbers appear here once the reader app starts sending reading events.
          </CardContent>
        </Card>
      )}

      {(data?.topBooks.length ?? 0) > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> Popular books</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Book</TableHead><TableHead className="text-right">Opens</TableHead><TableHead className="text-right">Readers</TableHead><TableHead className="text-right">Completions</TableHead><TableHead className="text-right">Completion rate</TableHead><TableHead className="text-right">Time read</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data!.topBooks.map((b) => (
                  <TableRow key={b.book_id}>
                    <TableCell className="font-medium">{data!.topBooks.find((x) => x.book_id === b.book_id) && <span>{b.last_event_at ? new Date(b.last_event_at).toLocaleDateString() : ""}</span>}</TableCell>
                    <TableCell className="text-right">{b.opens}</TableCell>
                    <TableCell className="text-right">{b.unique_readers}</TableCell>
                    <TableCell className="text-right">{b.completes}</TableCell>
                    <TableCell className="text-right">{pct(b.completes, b.opens)}</TableCell>
                    <TableCell className="text-right">{hours(b.seconds_read)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(data?.topChapters.length ?? 0) > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" /> Popular chapters</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Chapter</TableHead><TableHead>Book</TableHead><TableHead className="text-right">Opens</TableHead><TableHead className="text-right">Readers</TableHead><TableHead className="text-right">Completion rate</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data!.topChapters.slice(0, 15).map((c) => {
                  const info = data!.chapterInfo.get(c.chapter_id);
                  return (
                    <TableRow key={c.chapter_id}>
                      <TableCell className="font-medium">{info?.title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{info?.book ?? "—"}</TableCell>
                      <TableCell className="text-right">{c.opens}</TableCell>
                      <TableCell className="text-right">{c.unique_readers}</TableCell>
                      <TableCell className="text-right">{pct(c.completes, c.opens)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
