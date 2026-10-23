import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canFinance, formatPrice, logAction, myRolesQuery } from "@/lib/admin";
import { recordReaderPayment } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Orders & payments — Hawwii Admin" }, { name: "description", content: "Verified bank and telebirr payments." }, { property: "og:title", content: "Orders & payments — Hawwii Admin" }, { property: "og:description", content: "Verified bank and telebirr payments." }] }),
  component: OrdersPage,
});

const tone: Record<string, string> = { paid: "bg-success/15 text-success", pending: "bg-warning/20", rejected: "bg-destructive/10 text-destructive", refunded: "bg-muted text-muted-foreground" };

function OrdersPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = canFinance(roles);
  const [status, setStatus] = useState("all");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["orders", status],
    queryFn: async () => {
      let q = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(300);
      if (status !== "all") q = q.eq("status", status);
      const [o, p] = await Promise.all([q, supabase.from("profiles").select("id,email")]);
      const emails = new Map((p.data ?? []).map((x) => [x.id, x.email]));
      const proofPaths = (o.data ?? []).flatMap((x) => x.receipt_path ? [x.receipt_path] : []);
      const { data: signedProofs } = proofPaths.length ? await supabase.storage.from("payment-receipts").createSignedUrls(proofPaths, 600) : { data: [] };
      const proofUrls = new Map((signedProofs ?? []).flatMap((proof) => proof.path && proof.signedUrl ? [[proof.path, proof.signedUrl] as const] : []));
      return (o.data ?? []).map((x) => ({ ...x, email: emails.get(x.user_id) ?? "Reader", proofUrl: x.receipt_path ? proofUrls.get(x.receipt_path) ?? null : null }));
    },
  });
  const paid = (data ?? []).filter((o) => o.status === "paid");
  const revenue = paid.reduce((s, o) => s + o.amount_cents, 0);

  async function reviewProof(id: string, approved: boolean) {
    const reason = approved ? null : prompt("Why could this payment not be confirmed?");
    if (!approved && reason === null) return;
    setReviewingId(id);
    const { error } = await supabase.rpc("review_uploaded_payment", { p_order_id: id, p_approved: approved, p_reason: reason });
    setReviewingId(null);
    if (error) { toast.error(error.message); return; }
    await logAction(approved ? "approve_uploaded_payment" : "reject_uploaded_payment", "order", id, reason ?? undefined);
    toast.success(approved ? "Payment confirmed and access granted." : "Payment proof rejected.");
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  async function refund(id: string) {
    const reason = prompt("Refund reason (the reader loses access to this item)");
    if (reason === null) return;
    const { error } = await supabase.from("orders").update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("entitlements").update({ revoked_at: new Date().toISOString() }).eq("order_id", id);
    await logAction("refund", "order", id, reason || undefined);
    toast.success("Marked as refunded. Send the money back to the reader from your bank or telebirr.");
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  return (
    <>
      <PageHeader title="Orders & payments" description="Receipt links are checked with the provider. Uploaded receipt photos wait here for finance review." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Revenue (shown)" value={formatPrice(revenue, "ETB")} />
        <Kpi label="Paid orders" value={String(paid.length)} />
        <Kpi label="Rejected" value={String((data ?? []).filter((o) => o.status === "rejected").length)} />
        <Kpi label="Refunded" value={String((data ?? []).filter((o) => o.status === "refunded").length)} />
      </div>
      {can && <RecordPayment onDone={() => qc.invalidateQueries({ queryKey: ["orders"] })} />}
      <div className="mb-3 flex justify-end">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "paid", "pending", "rejected", "refunded"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reader</TableHead><TableHead>Item</TableHead><TableHead>Price / paid</TableHead><TableHead>Bank & reference</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No orders yet.</TableCell></TableRow>}
            {data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{o.email}{o.payer_name && <p className="text-xs text-muted-foreground">Payer: {o.payer_name}</p>}</TableCell>
                <TableCell className="max-w-56 truncate text-sm" title={o.item_title}>{o.item_title}</TableCell>
                <TableCell className="text-sm">{formatPrice(o.amount_cents, o.currency)}{o.paid_cents != null && <p className="text-xs text-muted-foreground">paid {formatPrice(o.paid_cents, o.currency)}</p>}</TableCell>
                <TableCell className="text-xs">{o.receipt_source ?? "—"}<p className="font-mono">{o.receipt_reference}</p>{o.receiver_name && <p className="text-muted-foreground">to {o.receiver_name}</p>}{o.proofUrl && <a className="mt-1 inline-block text-primary underline" href={o.proofUrl} target="_blank" rel="noreferrer">View uploaded proof</a>}</TableCell>
                <TableCell>
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone[o.status])}>{o.status}</span>
                  {o.rejection_reason && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{o.rejection_reason}</p>}
                  {o.refund_reason && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{o.refund_reason}</p>}
                </TableCell>
                <TableCell><div className="flex flex-wrap gap-2">{can && o.status === "pending" && o.receipt_path && <><Button size="sm" disabled={reviewingId === o.id} onClick={() => void reviewProof(o.id, true)}>{reviewingId === o.id ? "Saving…" : "Approve"}</Button><Button size="sm" variant="outline" disabled={reviewingId === o.id} onClick={() => void reviewProof(o.id, false)}>Reject</Button></>}{can && o.status === "paid" && <Button size="sm" variant="outline" onClick={() => refund(o.id)}>Refund</Button>}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>;
}

function RecordPayment({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [bookId, setBookId] = useState("");
  const [chapterId, setChapterId] = useState("whole");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: books = [] } = useQuery({ queryKey: ["sellable-books"], queryFn: async () => (await supabase.from("books").select("id,title,access_type,price_cents").order("title")).data ?? [] });
  const { data: chapters = [] } = useQuery({
    queryKey: ["sellable-chapters", bookId], enabled: !!bookId,
    queryFn: async () => (await supabase.from("chapters").select("id,number,title,price_cents,is_free").eq("book_id", bookId).eq("is_free", false).gt("price_cents", 0).order("number")).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId) { toast.error("Choose a book."); return; }
    setBusy(true);
    try {
      const res = await recordReaderPayment({ data: { email, receiptUrl: url, ...(chapterId === "whole" ? { bookId } : { chapterId }) } });
      if (res.ok) { toast.success(`Verified — ${res.itemTitle} unlocked for ${email}`); setUrl(""); }
      else toast.error(res.reason);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">Verify a receipt for a reader</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label>Reader email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1"><Label>Receipt link</Label><Input type="url" required placeholder="https://transactioninfo.ethiotelecom.et/receipt/…" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="space-y-1"><Label>Book</Label>
            <Select value={bookId} onValueChange={(v) => { setBookId(v); setChapterId("whole"); }}>
              <SelectTrigger><SelectValue placeholder="Choose a book" /></SelectTrigger>
              <SelectContent>{books.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}{b.access_type === "paid" ? ` — ${formatPrice(b.price_cents, "ETB")}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>What they bought</Label>
            <Select value={chapterId} onValueChange={setChapterId} disabled={!bookId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whole">Whole book</SelectItem>
                {chapters.map((c) => <SelectItem key={c.id} value={c.id}>Ch {c.number}: {c.title} — {formatPrice(c.price_cents, "ETB")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy} className="md:w-fit">{busy ? "Checking with the bank…" : "Verify & unlock"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
