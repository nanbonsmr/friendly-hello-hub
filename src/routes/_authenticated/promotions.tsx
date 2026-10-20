import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { canFinance, formatPrice, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Hawwii Admin" }, { name: "description", content: "Discount codes and campaigns." }, { property: "og:title", content: "Promotions — Hawwii Admin" }, { property: "og:description", content: "Discount codes and campaigns." }] }),
  component: PromosPage,
});

const empty = { code: "", description: "", discount_type: "percent" as "percent" | "amount", value: "", starts_at: "", ends_at: "", max_uses: "" };

function PromosPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = canFinance(roles) || roles.includes("content_manager");
  const [f, setF] = useState(empty);
  const { data } = useQuery({ queryKey: ["promos"], queryFn: async () => (await supabase.from("promotions").select("*").order("created_at", { ascending: false })).data ?? [] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["promos"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = f.discount_type === "percent" ? Math.round(Number(f.value)) : Math.round(Number(f.value) * 100);
    if (f.discount_type === "percent" && (value < 1 || value > 100)) { toast.error("Percent must be 1–100."); return; }
    const { error } = await supabase.from("promotions").insert({
      code: f.code.trim().toUpperCase(), description: f.description || null, discount_type: f.discount_type, discount_value: value,
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
    });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "promotion", undefined, f.code);
    setF(empty);
    refresh();
  }
  async function toggle(id: string, is_active: boolean) {
    const { error } = await supabase.from("promotions").update({ is_active }).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this promotion?")) return;
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  function state(p: NonNullable<typeof data>[number]) {
    const now = new Date();
    if (!p.is_active) return "Off";
    if (p.starts_at && new Date(p.starts_at) > now) return "Upcoming";
    if (p.ends_at && new Date(p.ends_at) < now) return "Expired";
    if (p.max_uses != null && p.uses >= p.max_uses) return "Used up";
    return "Running";
  }

  return (
    <>
      <PageHeader title="Promotions" description="Discount codes readers can apply at checkout." />
      {can && (
        <Card className="mb-6"><CardContent className="p-4">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label>Code</Label><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="LAUNCH20" /></div>
            <div className="space-y-1"><Label>Type</Label>
              <Select value={f.discount_type} onValueChange={(v) => setF({ ...f, discount_type: v as "percent" | "amount" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">Percent off</SelectItem><SelectItem value="amount">Amount off (USD)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{f.discount_type === "percent" ? "Percent" : "Amount"}</Label><Input required type="number" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
            <div className="space-y-1"><Label>Max uses</Label><Input type="number" min={1} value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} placeholder="Unlimited" /></div>
            <div className="space-y-1"><Label>Starts</Label><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></div>
            <div className="space-y-1"><Label>Ends</Label><Input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <Button type="submit" className="sm:w-fit">Create promotion</Button>
          </form>
        </CardContent></Card>
      )}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Window</TableHead><TableHead>Uses</TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No promotions yet.</TableCell></TableRow>}
            {data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell><p className="font-mono font-medium">{p.code}</p>{p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}</TableCell>
                <TableCell>{p.discount_type === "percent" ? `${p.discount_value}%` : formatPrice(p.discount_value)}</TableCell>
                <TableCell className="text-xs">{p.starts_at ? new Date(p.starts_at).toLocaleDateString() : "Now"} → {p.ends_at ? new Date(p.ends_at).toLocaleDateString() : "No end"}</TableCell>
                <TableCell>{p.uses}{p.max_uses != null && ` / ${p.max_uses}`}</TableCell>
                <TableCell className="text-sm">{state(p)}</TableCell>
                <TableCell className="flex items-center gap-2">
                  <Switch disabled={!can} checked={p.is_active} onCheckedChange={(v) => toggle(p.id, v)} />
                  {can && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
