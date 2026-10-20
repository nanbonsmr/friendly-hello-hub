import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, FileUp, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/admin-shell";
import { canEdit, countWords, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Chapter = Database["public"]["Tables"]["chapters"]["Row"];
const STATUSES = ["draft", "in_review", "scheduled", "published", "unpublished"] as const;
const BUCKET = "chapter-files";
const MAX_MB = 50;

export const Route = createFileRoute("/_authenticated/books/$id_/chapters/$chapterId")({
  head: () => ({ meta: [{ title: "Chapter editor — Hawwii Admin" }, { name: "description", content: "Write or upload a chapter." }, { property: "og:title", content: "Chapter editor — Hawwii Admin" }, { property: "og:description", content: "Write or upload a chapter." }] }),
  component: ChapterPage,
});

function ChapterPage() {
  const { id: bookId, chapterId } = Route.useParams();
  const isNew = chapterId === "new";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: roles = [] } = useQuery(myRolesQuery);
  const editable = canEdit(roles);

  const { data, isLoading } = useQuery({
    queryKey: ["chapter", bookId, chapterId],
    queryFn: async () => {
      const [book, chapters, ch] = await Promise.all([
        supabase.from("books").select("title").eq("id", bookId).maybeSingle(),
        supabase.from("chapters").select("number").eq("book_id", bookId).order("number", { ascending: false }).limit(1),
        isNew ? Promise.resolve({ data: null }) : supabase.from("chapters").select("*").eq("id", chapterId).maybeSingle(),
      ]);
      return { bookTitle: book.data?.title ?? "Book", nextNumber: (chapters.data?.[0]?.number ?? 0) + 1, chapter: ch.data as Chapter | null };
    },
  });

  const [c, setC] = useState<Partial<Chapter> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setC(data.chapter ?? { number: data.nextNumber, title: "", content: "", status: "draft", is_free: data.nextNumber === 1, price_cents: 0, content_type: "text" });
  }, [data]);

  // Preview: local file if just picked, else signed URL for stored file.
  useEffect(() => {
    if (file) {
      const u = URL.createObjectURL(file);
      setPdfUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    if (c?.pdf_path) {
      supabase.storage.from(BUCKET).createSignedUrl(c.pdf_path, 3600).then(({ data: s }) => setPdfUrl(s?.signedUrl ?? null));
    } else setPdfUrl(null);
    return undefined;
  }, [file, c?.pdf_path]);

  if (isLoading || !c) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && !data?.chapter) return <p className="text-muted-foreground">Chapter not found.</p>;

  const isPdf = c.content_type === "pdf";

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf") { toast.error("Please choose a PDF file."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`PDF must be under ${MAX_MB} MB.`); return; }
    setFile(f);
    if (!c?.title) setC({ ...c, title: f.name.replace(/\.pdf$/i, "") });
  }

  async function save() {
    if (!c?.title) { toast.error("Add a chapter title."); return; }
    if (isPdf && !file && !c.pdf_path) { toast.error("Upload a PDF for this chapter."); return; }
    setBusy(true);
    try {
      let pdf_path = c.pdf_path ?? null;
      let pdf_name = c.pdf_name ?? null;
      if (isPdf && file) {
        const path = `${bookId}/${crypto.randomUUID()}.pdf`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        if (c.pdf_path) await supabase.storage.from(BUCKET).remove([c.pdf_path]);
        pdf_path = path;
        pdf_name = file.name;
      }
      const payload = {
        book_id: bookId, number: c.number ?? 1, title: c.title, status: c.status ?? "draft",
        content_type: isPdf ? "pdf" : "text",
        content: c.content ?? "",
        word_count: isPdf ? 0 : countWords(c.content ?? ""),
        pdf_path, pdf_name,
        is_free: !!c.is_free, price_cents: c.price_cents ?? 0,
        published_at: c.status === "published" && !c.published_at ? new Date().toISOString() : c.published_at ?? null,
      };
      const res = isNew
        ? await supabase.from("chapters").insert(payload).select("id").single()
        : await supabase.from("chapters").update(payload).eq("id", chapterId).select("id").single();
      if (res.error) throw res.error;
      await logAction(isNew ? "create" : "update", "chapter", res.data.id, `${c.title}${isPdf ? " (PDF)" : ""}`);
      toast.success("Chapter saved");
      qc.invalidateQueries({ queryKey: ["book", bookId] });
      qc.invalidateQueries({ queryKey: ["chapter", bookId] });
      setFile(null);
      if (isNew) navigate({ to: "/books/$id/chapters/$chapterId", params: { id: bookId, chapterId: res.data.id }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save chapter");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew || !confirm("Delete this chapter permanently?")) return;
    if (c?.pdf_path) await supabase.storage.from(BUCKET).remove([c.pdf_path]);
    const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
    if (error) { toast.error(error.message); return; }
    await logAction("delete", "chapter", chapterId, c?.title ?? undefined);
    qc.invalidateQueries({ queryKey: ["book", bookId] });
    navigate({ to: "/books/$id", params: { id: bookId } });
  }

  return (
    <>
      <Link to="/books/$id" params={{ id: bookId }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {data?.bookTitle}
      </Link>
      <PageHeader
        title={isNew ? "New chapter" : `Chapter ${c.number}`}
        description={isPdf ? "PDF chapter" : `${countWords(c.content ?? "")} words`}
        action={editable && (
          <div className="flex gap-2">
            {!isNew && <Button variant="outline" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save chapter"}</Button>
          </div>
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
              <Field label="No."><Input type="number" min={1} disabled={!editable} value={c.number ?? 1} onChange={(e) => setC({ ...c, number: Number(e.target.value) })} /></Field>
              <Field label="Title"><Input disabled={!editable} value={c.title ?? ""} onChange={(e) => setC({ ...c, title: e.target.value })} /></Field>
            </div>

            <div className="inline-flex rounded-lg border p-1">
              {([["text", "Write text", Type], ["pdf", "Upload PDF", FileUp]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" disabled={!editable}
                  onClick={() => setC({ ...c, content_type: v })}
                  className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm", c.content_type === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {isPdf ? (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (editable) pickFile(e.dataTransfer.files[0]); }}
                  className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center"
                >
                  <FileText className="h-8 w-8 text-primary" />
                  <p className="text-sm font-medium">{file?.name ?? c.pdf_name ?? "Drag a PDF here"}</p>
                  <p className="text-xs text-muted-foreground">PDF only, up to {MAX_MB} MB</p>
                  {editable && (
                    <>
                      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{c.pdf_path || file ? "Replace PDF" : "Choose PDF"}</Button>
                    </>
                  )}
                </div>
                {pdfUrl && <iframe src={pdfUrl} title="PDF preview" className="h-[70vh] w-full rounded-lg border" />}
              </div>
            ) : (
              <Field label="Content">
                <Textarea rows={28} className="min-h-[60vh] font-serif text-base leading-relaxed" disabled={!editable} value={c.content ?? ""} onChange={(e) => setC({ ...c, content: e.target.value })} placeholder="Start writing…" />
              </Field>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Publishing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Status">
                <Select disabled={!editable} value={c.status ?? "draft"} onValueChange={(v) => setC({ ...c, status: v as Chapter["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Access</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between text-sm">Free chapter <Switch disabled={!editable} checked={!!c.is_free} onCheckedChange={(v) => setC({ ...c, is_free: v })} /></label>
              {!c.is_free && (
                <Field label="Chapter price (USD)"><Input type="number" min={0} step="0.01" disabled={!editable} value={(c.price_cents ?? 0) / 100} onChange={(e) => setC({ ...c, price_cents: Math.round(Number(e.target.value) * 100) })} /></Field>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
