import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader, StatusBadge } from "@/components/admin-shell";
import { BookRights } from "@/components/book-rights";
import { canEdit, effectiveStatus, isAdmin, logAction, myRolesQuery, toLocalInput } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Book = Database["public"]["Tables"]["books"]["Row"];
const BOOK_STATUSES = ["draft", "in_review", "scheduled", "published", "unpublished", "archived"] as const;
const ACCESS = ["free", "paid", "subscription", "per_chapter"] as const;

export const Route = createFileRoute("/_authenticated/books/$id")({
  head: () => ({ meta: [{ title: "Edit book — Hawwii Admin" }, { name: "description", content: "Edit book details and chapters." }, { property: "og:title", content: "Edit book — Hawwii Admin" }, { property: "og:description", content: "Edit book details and chapters." }] }),
  component: BookPage,
});

function BookPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const editable = canEdit(roles);
  const { data, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      const [b, c, g, a, ba] = await Promise.all([
        supabase.from("books").select("*").eq("id", id).maybeSingle(),
        supabase.from("chapters").select("*").eq("book_id", id).order("number"),
        supabase.from("genres").select("id,name").order("name"),
        supabase.from("authors").select("id,name").order("name"),
        supabase.from("book_authors").select("author_id").eq("book_id", id),
      ]);
      if (b.error) throw b.error;
      return { book: b.data, chapters: c.data ?? [], genres: g.data ?? [], authors: a.data ?? [], authorIds: (ba.data ?? []).map((x) => x.author_id) };
    },
  });
  const [form, setForm] = useState<Book | null>(null);
  useEffect(() => { if (data?.book) setForm(data.book); }, [data?.book]);

  if (isLoading || !form) return <p className="text-muted-foreground">{isLoading ? "Loading…" : "Book not found."}</p>;
  const set = <K extends keyof Book>(k: K, v: Book[K]) => setForm({ ...form, [k]: v });

  async function save() {
    if (!form) return;
    const { id: _id, created_at, updated_at, created_by, ...rest } = form;
    const patch = { ...rest, published_at: form.status === "published" && !form.published_at ? new Date().toISOString() : form.published_at };
    const { error } = await supabase.from("books").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction("update", "book", id, `status=${form.status}`);
    toast.success("Book saved");
    qc.invalidateQueries({ queryKey: ["book", id] });
  }

  async function toggleAuthor(aid: string, on: boolean) {
    const { error } = on
      ? await supabase.from("book_authors").insert({ book_id: id, author_id: aid })
      : await supabase.from("book_authors").delete().eq("book_id", id).eq("author_id", aid);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["book", id] });
  }

  async function del() {
    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction("delete", "book", id, form?.title);
    toast.success("Book deleted");
    navigate({ to: "/books" });
  }

  return (
    <>
      <Link to="/books" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Books</Link>
      <PageHeader
        title={form.title}
        description={`Last updated ${new Date(form.updated_at).toLocaleString()}`}
        action={
          <div className="flex gap-2">
            {isAdmin(roles) && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline"><Trash2 className="h-4 w-4" /> Delete</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Delete this book?</AlertDialogTitle><AlertDialogDescription>All its chapters will be removed permanently.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={del}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {editable && <Button onClick={save}>Save changes</Button>}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Title"><Input disabled={!editable} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Subtitle"><Input disabled={!editable} value={form.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Description"><Textarea disabled={!editable} rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <Field label="Cover image URL"><Input disabled={!editable} value={form.cover_url ?? ""} onChange={(e) => set("cover_url", e.target.value)} /></Field>
            <Field label="ISBN"><Input disabled={!editable} value={form.isbn ?? ""} onChange={(e) => set("isbn", e.target.value)} /></Field>
            <Field label="Language"><Input disabled={!editable} value={form.language} onChange={(e) => set("language", e.target.value)} /></Field>
            <Field label="Genre">
              <Select disabled={!editable} value={form.genre_id ?? "none"} onValueChange={(v) => set("genre_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{data!.genres.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Publishing & pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Status">
                <Select disabled={!editable} value={form.status} onValueChange={(v) => set("status", v as Book["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOOK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {form.status === "scheduled" && (
                <Field label="Publish at"><Input type="datetime-local" disabled={!editable} value={toLocalInput(form.scheduled_at)} onChange={(e) => set("scheduled_at", e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
              )}
              <Field label="Access">
                <Select disabled={!editable} value={form.access_type} onValueChange={(v) => set("access_type", v as Book["access_type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCESS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {form.access_type === "paid" && (
                <Field label={`Price (${form.currency})`}><Input type="number" min={0} step="0.01" disabled={!editable} value={form.price_cents / 100} onChange={(e) => set("price_cents", Math.round(Number(e.target.value) * 100))} /></Field>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Authors</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data!.authors.length === 0 && <p className="text-sm text-muted-foreground">No authors yet. <Link to="/authors" className="text-primary underline">Add one</Link>.</p>}
              {data!.authors.map((a) => (
                <label key={a.id} className="flex items-center justify-between text-sm">
                  {a.name}
                  <Switch disabled={!editable} checked={data!.authorIds.includes(a.id)} onCheckedChange={(on) => toggleAuthor(a.id, on)} />
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <BookRights bookId={id} editable={editable} />
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Chapters</CardTitle>
          {editable && <Button size="sm" onClick={() => navigate({ to: "/books/$id/chapters/$chapterId", params: { id, chapterId: "new" } })}><Plus className="h-4 w-4" /> Add chapter</Button>}
        </CardHeader>
        <CardContent>
          {data!.chapters.length === 0 && <p className="text-sm text-muted-foreground">No chapters yet.</p>}
          <ul className="divide-y">
            {data!.chapters.map((c) => (
              <li key={c.id} className="flex items-center gap-4 py-3">
                <span className="w-8 text-sm text-muted-foreground">{c.number}</span>
                <Link to="/books/$id/chapters/$chapterId" params={{ id, chapterId: c.id }} className="flex-1 text-sm font-medium hover:text-primary">{c.title}{c.content_type === "pdf" && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">PDF</span>}</Link>
                <span className="text-xs text-muted-foreground">{c.word_count} words</span>
                <span className="text-xs">{c.is_free ? "Free" : "Premium"}</span>
                <StatusBadge status={effectiveStatus(c.status, c.scheduled_at)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

