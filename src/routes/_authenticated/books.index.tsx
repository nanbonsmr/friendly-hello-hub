import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, ArchiveRestore, Copy, Eye, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/admin-shell";
import { canEdit, effectiveStatus, formatPrice, isAdmin, logAction, myRolesQuery, slugify } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
            <TableRow><TableHead>Title</TableHead><TableHead>Genre</TableHead><TableHead>Status</TableHead><TableHead>Access</TableHead><TableHead className="text-right">Chapters</TableHead><TableHead className="w-12" /></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {books?.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No books found.</TableCell></TableRow>}
            {books?.map((b) => (
              <TableRow key={b.id}>
                <TableCell><Link to="/books/$id" params={{ id: b.id }} className="font-medium hover:text-primary">{b.title}</Link></TableCell>
                <TableCell className="text-muted-foreground">{b.genres?.name ?? "—"}</TableCell>
                <TableCell><StatusBadge status={effectiveStatus(b.status, b.scheduled_at)} /></TableCell>
                <TableCell className="text-sm">{b.access_type === "paid" ? formatPrice(b.price_cents, b.currency) : b.access_type.replace("_", " ")}</TableCell>
                <TableCell className="text-right">{b.chapters?.[0]?.count ?? 0}</TableCell>
                <TableCell><BookActions id={b.id} title={b.title} status={b.status} editable={canEdit(roles)} admin={isAdmin(roles)} /></TableCell>
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

function BookActions({ id, title, status, editable, admin }: { id: string; title: string; status: string; editable: boolean; admin: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["books"] });

  async function duplicate() {
    const { data: b, error } = await supabase.from("books").select("*").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    const { id: _i, created_at: _c, updated_at: _u, published_at: _p, ...rest } = b;
    const { data: u } = await supabase.auth.getUser();
    const copyTitle = `${title} (copy)`;
    const { data: nb, error: e2 } = await supabase.from("books")
      .insert({ ...rest, title: copyTitle, slug: `${slugify(copyTitle)}-${Math.random().toString(36).slice(2, 6)}`, status: "draft", scheduled_at: null, created_by: u.user?.id ?? null })
      .select("id").single();
    if (e2) { toast.error(e2.message); return; }
    const [{ data: chs }, { data: auths }] = await Promise.all([
      supabase.from("chapters").select("*").eq("book_id", id),
      supabase.from("book_authors").select("author_id").eq("book_id", id),
    ]);
    if (chs?.length) {
      await supabase.from("chapters").insert(chs.map(({ id: _x, created_at: _y, updated_at: _z, published_at: _w, ...c }) => ({ ...c, book_id: nb.id, status: "draft" as const, scheduled_at: null })));
    }
    if (auths?.length) await supabase.from("book_authors").insert(auths.map((a) => ({ book_id: nb.id, author_id: a.author_id })));
    await logAction("create", "book", nb.id, `duplicated from ${title}`);
    toast.success("Book duplicated as draft");
    refresh();
  }

  async function setStatus(next: "archived" | "draft") {
    const { error } = await supabase.from("books").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction("update", "book", id, `status=${next}`);
    toast.success(next === "archived" ? "Book archived" : "Book restored to draft");
    refresh();
  }

  async function del() {
    const { data: files } = await supabase.from("chapters").select("pdf_path").eq("book_id", id).not("pdf_path", "is", null);
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    const paths = (files ?? []).map((f) => f.pdf_path).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from("chapter-files").remove(paths);
    await logAction("delete", "book", id, title);
    toast.success("Book deleted");
    refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${title}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate({ to: "/books/$id", params: { id } })}>{editable ? <><Pencil className="h-4 w-4" /> Edit book</> : <><Eye className="h-4 w-4" /> View book</>}</DropdownMenuItem>
          {editable && <DropdownMenuItem onClick={() => navigate({ to: "/books/$id/chapters/$chapterId", params: { id, chapterId: "new" } })}><Plus className="h-4 w-4" /> Add chapter</DropdownMenuItem>}
          {editable && <DropdownMenuItem onClick={duplicate}><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>}
          {editable && (status === "archived"
            ? <DropdownMenuItem onClick={() => setStatus("draft")}><ArchiveRestore className="h-4 w-4" /> Unarchive</DropdownMenuItem>
            : <DropdownMenuItem onClick={() => setStatus("archived")}><Archive className="h-4 w-4" /> Archive</DropdownMenuItem>)}
          {admin && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete "{title}"?</AlertDialogTitle><AlertDialogDescription>The book, all its chapters and uploaded PDFs will be removed permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={del}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
