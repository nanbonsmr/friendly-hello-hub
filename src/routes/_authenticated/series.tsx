import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canEdit, logAction, myRolesQuery, slugify } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/series")({
  head: () => ({ meta: [{ title: "Series — Hawwii Admin" }, { name: "description", content: "Group books into ordered series." }, { property: "og:title", content: "Series — Hawwii Admin" }, { property: "og:description", content: "Group books into ordered series." }] }),
  component: SeriesPage,
});

function SeriesPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = canEdit(roles);
  const [name, setName] = useState("");
  const { data } = useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const [s, b] = await Promise.all([
        supabase.from("series").select("id,name,series_books(position,book_id,books(title))").order("name"),
        supabase.from("books").select("id,title").order("title"),
      ]);
      return { series: s.data ?? [], books: b.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["series"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("series").insert({ name, slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}` });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "series", undefined, name);
    setName("");
    refresh();
  }
  async function addBook(seriesId: string, bookId: string, nextPos: number) {
    const { error } = await supabase.from("series_books").insert({ series_id: seriesId, book_id: bookId, position: nextPos });
    if (error) toast.error(error.message); else refresh();
  }
  async function setPos(seriesId: string, bookId: string, position: number) {
    const { error } = await supabase.from("series_books").update({ position }).eq("series_id", seriesId).eq("book_id", bookId);
    if (error) toast.error(error.message); else refresh();
  }
  async function removeBook(seriesId: string, bookId: string) {
    const { error } = await supabase.from("series_books").delete().eq("series_id", seriesId).eq("book_id", bookId);
    if (error) toast.error(error.message); else refresh();
  }
  async function removeSeries(id: string) {
    if (!confirm("Delete this series? Books stay in the catalogue.")) return;
    const { error } = await supabase.from("series").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  return (
    <>
      <PageHeader title="Series" description="Readers see series books in this order." />
      {can && (
        <form onSubmit={add} className="mb-6 flex max-w-md gap-2">
          <Input required placeholder="New series name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
      )}
      {data?.series.length === 0 && <p className="text-sm text-muted-foreground">No series yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.series.map((s) => {
          const items = [...s.series_books].sort((a, b) => a.position - b.position);
          const available = data.books.filter((b) => !items.some((i) => i.book_id === b.id));
          return (
            <Card key={s.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{s.name}</CardTitle>
                {can && <Button variant="ghost" size="icon" aria-label="Delete series" onClick={() => removeSeries(s.id)}><Trash2 className="h-4 w-4" /></Button>}
              </CardHeader>
              <CardContent className="space-y-2">
                {items.length === 0 && <p className="text-sm text-muted-foreground">No books in this series.</p>}
                {items.map((i) => (
                  <div key={i.book_id} className="flex items-center gap-2">
                    <Input type="number" min={1} disabled={!can} className="h-8 w-16" defaultValue={i.position} onBlur={(e) => Number(e.target.value) !== i.position && setPos(s.id, i.book_id, Number(e.target.value))} />
                    <Link to="/books/$id" params={{ id: i.book_id }} className="flex-1 text-sm hover:text-primary">{i.books?.title}</Link>
                    {can && <button aria-label="Remove" onClick={() => removeBook(s.id, i.book_id)}><X className="h-4 w-4 text-muted-foreground" /></button>}
                  </div>
                ))}
                {can && available.length > 0 && (
                  <Select value="" onValueChange={(v) => addBook(s.id, v, (items.at(-1)?.position ?? 0) + 1)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Add a book…" /></SelectTrigger>
                    <SelectContent>{available.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
