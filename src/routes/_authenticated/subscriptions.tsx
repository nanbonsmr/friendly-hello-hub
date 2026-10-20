import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canFinance, formatPrice, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — Hawwii Admin" }, { name: "description", content: "Plans and subscribers." }, { property: "og:title", content: "Subscriptions — Hawwii Admin" }, { property: "og:description", content: "Plans and subscribers." }] }),
  component: SubsPage,
});

const SUB_STATUSES = ["trialing", "active", "past_due", "canceled", "expired"] as const;

function SubsPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = canFinance(roles);
  const [f, setF] = useState({ name: "", price: "", interval: "month" as "month" | "year" });
  const { data } = useQuery({
    queryKey: ["subs"],
    queryFn: async () => {
      const [plans, subs, profiles] = await Promise.all([
        supabase.from("subscription_plans").select("*").order("price_cents"),
        supabase.from("subscriptions").select("*, subscription_plans(name)").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id,email"),
      ]);
      const emails = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
      return { plans: plans.data ?? [], subs: (subs.data ?? []).map((s) => ({ ...s, email: emails.get(s.user_id) ?? s.user_id })) };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["subs"] });

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("subscription_plans").insert({ name: f.name, price_cents: Math.round(Number(f.price) * 100), interval: f.interval });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "plan", undefined, f.name);
    setF({ name: "", price: "", interval: "month" });
    refresh();
  }
  async function togglePlan(id: string, is_active: boolean) {
    const { error } = await supabase.from("subscription_plans").update({ is_active }).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function setSubStatus(id: string, status: (typeof SUB_STATUSES)[number]) {
    const { error } = await supabase.from("subscriptions").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAction("update", "subscription", id, status);
    refresh();
  }

  const active = data?.subs.filter((s) => s.status === "active" || s.status === "trialing").length ?? 0;

  return (
    <>
      <PageHeader title="Subscriptions" description={`${active} active subscribers`} />
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Plans</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {can && (
            <form onSubmit={addPlan} className="flex flex-wrap gap-2">
              <Input required placeholder="Plan name" className="min-w-48 flex-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Input required type="number" min={0} step="0.01" placeholder="Price (USD)" className="w-36" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
              <Select value={f.interval} onValueChange={(v) => setF({ ...f, interval: v as "month" | "year" })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="month">Monthly</SelectItem><SelectItem value="year">Yearly</SelectItem></SelectContent>
              </Select>
              <Button type="submit">Add plan</Button>
            </form>
          )}
          {data?.plans.length === 0 && <p className="text-sm text-muted-foreground">No plans yet.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data?.plans.map((p) => (
              <div key={p.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between"><p className="font-medium">{p.name}</p><Switch disabled={!can} checked={p.is_active} onCheckedChange={(v) => togglePlan(p.id, v)} /></div>
                <p className="mt-1 text-2xl font-semibold">{formatPrice(p.price_cents, p.currency)}<span className="text-sm font-normal text-muted-foreground"> / {p.interval}</span></p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Reader</TableHead><TableHead>Plan</TableHead><TableHead>Renews / ends</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.subs.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No subscribers yet. They appear here once readers subscribe in the app.</TableCell></TableRow>}
            {data?.subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-sm">{s.email}</TableCell>
                <TableCell className="text-sm">{s.subscription_plans?.name}</TableCell>
                <TableCell className="text-sm">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <Select disabled={!can} value={s.status} onValueChange={(v) => setSubStatus(s.id, v as (typeof SUB_STATUSES)[number])}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{SUB_STATUSES.map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
