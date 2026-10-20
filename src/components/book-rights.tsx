import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAction } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const empty = { rights_holder: "", license_type: "exclusive", territory: "Worldwide", starts_on: "", ends_on: "", notes: "" };

export function BookRights({ bookId, editable }: { bookId: string; editable: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState(empty);
  const { data = [] } = useQuery({ queryKey: ["rights", bookId], queryFn: async () => (await supabase.from("book_rights").select("*").eq("book_id", bookId).order("created_at")).data ?? [] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("book_rights").insert({ book_id: bookId, ...f, starts_on: f.starts_on || null, ends_on: f.ends_on || null, notes: f.notes || null });
    if (error) { toast.error(error.message); return; }
    await logAction("create", "book_rights", bookId, f.rights_holder);
    setF(empty);
    qc.invalidateQueries({ queryKey: ["rights", bookId] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("book_rights").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["rights", bookId] });
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="mt-6">
      <CardHeader><CardTitle className="text-base">Rights & copyright</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No rights records yet.</p>}
        {data.map((r) => {
          const expired = r.ends_on && r.ends_on < today;
          return (
            <div key={r.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="text-sm">
                <p className="font-medium">{r.rights_holder} <span className="font-normal text-muted-foreground">· {r.license_type} · {r.territory}</span></p>
                <p className={expired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{r.starts_on ?? "—"} → {r.ends_on ?? "No end date"}{expired && " (expired)"}</p>
                {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
              </div>
              {editable && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          );
        })}
        {editable && (
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-3">
            <Input required placeholder="Rights holder" value={f.rights_holder} onChange={(e) => setF({ ...f, rights_holder: e.target.value })} />
            <Select value={f.license_type} onValueChange={(v) => setF({ ...f, license_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["exclusive", "non-exclusive", "public domain", "creative commons", "owned"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Territory" value={f.territory} onChange={(e) => setF({ ...f, territory: e.target.value })} />
            <Input type="date" aria-label="Start date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
            <Input type="date" aria-label="End date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
            <Input placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            <Button type="submit" className="sm:w-fit">Add rights record</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
