import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/admin-shell";
import { canEdit, effectiveStatus, formatPrice, logAction, myRolesQuery, slugify } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/books/")({
  head: () => ({ meta: [{ title: "Books — Hawwii Admin" }, { name: "description", content: "Manage the book catalogue." }, { property: "og:title", content: "Books — Hawwii Admin" }, { property: "og:description", content: "Manage the book catalogue." }] }),
  component: BooksPage,
});

const STATUSES = ["draft", "in_review", "scheduled", "published", "unpublished", "archived"] as const;

function BooksPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const { data: roles = [] } = useQuery(myRolesQuery);
  const { data: books, isLoading } = useQuery({
    queryKey: ["books", q, status],
    queryFn: async () => {
      let query = supabase.from("books").select("id,title,status,scheduled_at,access_type,price_cents,currency,updated_at,genres(name),chapters(count)").order("updated_at", { ascending: false });
      if (q) query = query.ilike("title", `%${q}%`);
      if (status !== "all") query = query.eq("status", status as (typeof STATUSES)[number]);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader title="Books" description="All titles in the catalogue." action={canEdit(roles) && <NewBookDialog />} />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search titles…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Title</TableHead><TableHead>Genre</TableHead><TableHead>Status</TableHead><TableHead>Access</TableHead><TableHead className="text-right">Chapters</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {books?.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No books found.</TableCell></TableRow>}
            {books?.map((b) => (
              <TableRow key={b.id}>
                <TableCell><Link to="/books/$id" params={{ id: b.id }} className="font-medium hover:text-primary">{b.title}</Link></TableCell>
                <TableCell className="text-muted-foreground">{b.genres?.name ?? "—"}</TableCell>
                <TableCell><StatusBadge status={effectiveStatus(b.status, b.scheduled_at)} /></TableCell>
                <TableCell className="text-sm">{b.access_type === "paid" ? formatPrice(b.price_cents, b.currency) : b.access_type.replace("_", " ")}</TableCell>
                <TableCell className="text-right">{b.chapters?.[0]?.count ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function NewBookDialog() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("books")
      .insert({ title, slug: `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`, created_by: u.user?.id ?? null })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAction("create", "book", data.id, title);
    toast.success("Book created");
    navigate({ to: "/books/$id", params: { id: data.id } });
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New book</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New book</DialogTitle></DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="t">Title</Label><Input id="t" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <Button type="submit" disabled={busy} className="w-full">Create draft</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
