import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Hawwii Admin" }, { name: "description", content: "Platform overview." }, { property: "og:title", content: "Dashboard — Hawwii Admin" }, { property: "og:description", content: "Platform overview." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const count = async (t: "books" | "chapters" | "authors" | "genres", status?: string) => {
        let q = supabase.from(t).select("*", { count: "exact", head: true });
        if (status) q = q.eq("status" as never, status as never);
        const { count: c, error } = await q;
        if (error) throw error;
        return c ?? 0;
      };
      const [books, published, drafts, chapters, authors, genres, recent] = await Promise.all([
        count("books"), count("books", "published"), count("books", "draft"), count("chapters"), count("authors"), count("genres"),
        supabase.from("books").select("id,title,status,updated_at").order("updated_at", { ascending: false }).limit(6),
      ]);
      return { books, published, drafts, chapters, authors, genres, recent: recent.data ?? [] };
    },
  });

  const kpis = [
    ["Total books", data?.books], ["Published", data?.published], ["Drafts", data?.drafts],
    ["Chapters", data?.chapters], ["Authors", data?.authors], ["Genres", data?.genres],
  ] as const;

  return (
    <>
      <PageHeader title="Overview" description="Live counts from your catalogue." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([label, v]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              {isLoading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold">{v}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Recently updated books</CardTitle></CardHeader>
        <CardContent>
          {data?.recent.length === 0 && <p className="text-sm text-muted-foreground">No books yet. <Link to="/books" className="text-primary underline">Add your first book</Link>.</p>}
          <ul className="divide-y">
            {data?.recent.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <Link to="/books/$id" params={{ id: b.id }} className="text-sm font-medium hover:text-primary">{b.title}</Link>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
