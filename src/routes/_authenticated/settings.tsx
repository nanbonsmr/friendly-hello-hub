import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/admin-shell";
import { isAdmin, logAction, myRolesQuery } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Settings = Database["public"]["Tables"]["platform_settings"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Hawwii Admin" }, { name: "description", content: "Platform-wide settings." }, { property: "og:title", content: "Settings — Hawwii Admin" }, { property: "og:description", content: "Platform-wide settings." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery(myRolesQuery);
  const can = isAdmin(roles);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("platform_settings").select("*").eq("id", 1).single()).data });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return <p className="text-muted-foreground">Loading…</p>;

  async function save() {
    if (!s) return;
    const { id, updated_at, ...patch } = s;
    const { error } = await supabase.from("platform_settings").update(patch).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    await logAction("update", "settings");
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const toggle = (k: "reviews_enabled" | "require_review_approval" | "maintenance_mode", label: string, hint: string) => (
    <label className="flex items-start justify-between gap-4">
      <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
      <Switch disabled={!can} checked={s[k]} onCheckedChange={(v) => setS({ ...s, [k]: v })} />
    </label>
  );

  return (
    <>
      <PageHeader title="Settings" description={can ? "Changes apply to the reader app." : "Only administrators can change settings."} action={can && <Button onClick={save}>Save settings</Button>} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1"><Label>Platform name</Label><Input disabled={!can} value={s.platform_name} onChange={(e) => setS({ ...s, platform_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Support email</Label><Input type="email" disabled={!can} value={s.support_email ?? ""} onChange={(e) => setS({ ...s, support_email: e.target.value || null })} /></div>
            {toggle("maintenance_mode", "Maintenance mode", "Reader app shows a maintenance notice.")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Monetisation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1"><Label>Default currency</Label><Input disabled={!can} maxLength={3} value={s.default_currency} onChange={(e) => setS({ ...s, default_currency: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1"><Label>Default chapter price</Label><Input type="number" min={0} step="0.01" disabled={!can} value={s.default_chapter_price_cents / 100} onChange={(e) => setS({ ...s, default_chapter_price_cents: Math.round(Number(e.target.value) * 100) })} /></div>
            <div className="space-y-1"><Label>Telebirr phone number</Label><Input type="tel" disabled={!can} placeholder="09…" value={s.telebirr_phone_number ?? ""} onChange={(e) => setS({ ...s, telebirr_phone_number: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Bank name</Label><Input disabled={!can} placeholder="Bank of Abyssinia" value={s.bank_name ?? ""} onChange={(e) => setS({ ...s, bank_name: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Bank account number</Label><Input disabled={!can} inputMode="numeric" value={s.bank_account_number ?? ""} onChange={(e) => setS({ ...s, bank_account_number: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Account holder name</Label><Input disabled={!can} value={s.bank_account_holder ?? ""} onChange={(e) => setS({ ...s, bank_account_holder: e.target.value || null })} /><p className="text-xs text-muted-foreground">Use the exact account name shown on payment receipts.</p></div>
            <div className="space-y-1"><Label>Receiving account name(s)</Label><Textarea rows={2} disabled={!can} placeholder="Exact name on your telebirr / bank account, one per line" value={s.payment_receiver_names ?? ""} onChange={(e) => setS({ ...s, payment_receiver_names: e.target.value || null })} /><p className="text-xs text-muted-foreground">Receipts are only accepted if the money went to one of these names.</p></div>
            <div className="space-y-1"><Label>Payment instructions for readers</Label><Textarea rows={3} disabled={!can} placeholder="e.g. Send to telebirr 09xx… (Hawwii PLC), then paste your receipt link." value={s.payment_instructions ?? ""} onChange={(e) => setS({ ...s, payment_instructions: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Free preview chapters per book</Label><Input type="number" min={0} disabled={!can} value={s.free_preview_chapters} onChange={(e) => setS({ ...s, free_preview_chapters: Number(e.target.value) })} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Community</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {toggle("reviews_enabled", "Allow reviews", "Readers can rate and review books.")}
            {toggle("require_review_approval", "Approve reviews first", "New reviews wait for a moderator.")}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
