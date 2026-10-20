import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { isAdmin, logAction, myRolesQuery, ROLES } from "@/lib/admin";
import { inviteStaff, setStaffActive } from "@/lib/staff.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff & roles — Hawwii Admin" }, { name: "description", content: "Invite staff and manage roles." }, { property: "og:title", content: "Staff & roles — Hawwii Admin" }, { property: "og:description", content: "Invite staff and manage roles." }] }),
  component: StaffPage,
});

type Role = (typeof ROLES)[number];

function StaffPage() {
  const qc = useQueryClient();
  const { data: myRoles = [] } = useQuery(myRolesQuery);
  const admin = isAdmin(myRoles);
  const isSuper = myRoles.includes("super_admin");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const { data } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id,email,display_name,is_active,created_at").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (p.error) throw p.error;
      return (p.data ?? []).map((x) => ({ ...x, roles: (r.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.role) }));
    },
  });

  if (!admin) return <p className="text-muted-foreground">Only administrators can manage staff.</p>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await inviteStaff({ data: { email, role, redirectTo: `${window.location.origin}/dashboard` } });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function addRole(userId: string, r: Role) {
    if (r === "super_admin" && !confirm("Grant full Super Administrator access?")) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: r });
    if (error) { toast.error(error.message); return; }
    await logAction("grant_role", "staff", userId, r);
    refresh();
  }
  async function removeRole(userId: string, r: Role) {
    if (userId === me && (r === "super_admin" || r === "admin") && !confirm("Remove your own admin access?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r);
    if (error) { toast.error(error.message); return; }
    await logAction("revoke_role", "staff", userId, r);
    refresh();
  }
  async function toggleActive(userId: string, active: boolean) {
    try {
      await setStaffActive({ data: { userId, active } });
      toast.success(active ? "Account activated" : "Account deactivated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <>
      <PageHeader title="Staff & roles" description="Invite team members and control what each person can do." />
      <Card className="mb-6">
        <CardContent className="p-4">
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <Input type="email" required placeholder="name@example.com" className="min-w-60 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter((r) => isSuper || r !== "super_admin").map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={busy}><UserPlus className="h-4 w-4" /> {busy ? "Sending…" : "Send invite"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Roles</TableHead><TableHead>Add role</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell><p className="font-medium">{u.display_name}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground">Reader</span>}
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="gap-1">
                        {r.replace("_", " ")}
                        {(isSuper || r !== "super_admin") && <button aria-label={`Remove ${r}`} onClick={() => removeRole(u.id, r)}><X className="h-3 w-3" /></button>}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Select value="" onValueChange={(v) => addRole(u.id, v as Role)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Add…" /></SelectTrigger>
                    <SelectContent>{ROLES.filter((r) => !u.roles.includes(r) && (isSuper || r !== "super_admin")).map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Switch checked={u.is_active} disabled={u.id === me} onCheckedChange={(v) => toggleActive(u.id, v)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
