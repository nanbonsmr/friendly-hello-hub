import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { logAction } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — Hawwii Admin" }, { name: "description", content: "Reader support tickets." }, { property: "og:title", content: "Support — Hawwii Admin" }, { property: "og:description", content: "Reader support tickets." }] }),
  component: SupportPage,
});

const STATUSES = ["open", "pending", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function SupportPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets", filter],
    queryFn: async () => {
      let q = supabase.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const [t, p] = await Promise.all([q, supabase.from("profiles").select("id,email")]);
      const emails = new Map((p.data ?? []).map((x) => [x.id, x.email]));
      return (t.data ?? []).map((x) => ({ ...x, email: emails.get(x.user_id) ?? "Reader" }));
    },
  });
  const ticket = tickets.find((t) => t.id === selected);
  const { data: messages = [] } = useQuery({
    queryKey: ["ticket-messages", selected],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("support_messages").select("*").eq("ticket_id", selected!).order("created_at")).data ?? [],
  });

  async function update(patch: { status?: (typeof STATUSES)[number]; priority?: (typeof PRIORITIES)[number] }) {
    if (!selected) return;
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", selected);
    if (error) { toast.error(error.message); return; }
    await logAction("update", "ticket", selected, JSON.stringify(patch));
    qc.invalidateQueries({ queryKey: ["tickets"] });
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({ ticket_id: selected, author_id: u.user!.id, body: reply.trim(), is_staff: true });
    if (error) { toast.error(error.message); return; }
    if (ticket?.status === "open") await update({ status: "pending" });
    setReply("");
    qc.invalidateQueries({ queryKey: ["ticket-messages", selected] });
  }

  return (
    <>
      <PageHeader title="Support" description="Questions and issues sent from the reader app." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All tickets</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {tickets.length === 0 && <p className="p-4 text-sm text-muted-foreground">No tickets.</p>}
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)} className={cn("block w-full rounded-lg px-3 py-2 text-left hover:bg-muted", selected === t.id && "bg-muted")}>
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="text-xs text-muted-foreground">{t.email} · {t.priority} · {t.status}</p>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          {!ticket ? (
            <CardContent className="p-10 text-center text-sm text-muted-foreground">Select a ticket to read and reply.</CardContent>
          ) : (
            <>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <div><CardTitle className="text-base">{ticket.subject}</CardTitle><p className="text-xs text-muted-foreground">{ticket.email} · opened {new Date(ticket.created_at).toLocaleString()}</p></div>
                <div className="flex gap-2">
                  <Select value={ticket.priority} onValueChange={(v) => update({ priority: v as (typeof PRIORITIES)[number] })}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={ticket.status} onValueChange={(v) => update({ status: v as (typeof STATUSES)[number] })}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.is_staff ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-xs opacity-70">{m.is_staff ? "Staff" : "Reader"} · {new Date(m.created_at).toLocaleString()}</p>
                  </div>
                ))}
                <form onSubmit={send} className="space-y-2 pt-2">
                  <Textarea rows={3} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button type="submit" disabled={!reply.trim()}>Send reply</Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
