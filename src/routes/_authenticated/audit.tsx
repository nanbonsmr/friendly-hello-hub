import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit log — Hawwii Admin" }, { name: "description", content: "Staff activity history." }, { property: "og:title", content: "Audit log — Hawwii Admin" }, { property: "og:description", content: "Staff activity history." }] }),
  component: AuditPage,
});

function AuditPage() {
  const { data, error } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const [logs, profiles] = await Promise.all([
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id,email"),
      ]);
      if (logs.error) throw logs.error;
      const emails = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
      return logs.data.map((l) => ({ ...l, email: emails.get(l.actor_id ?? "") ?? "—" }));
    },
  });
  return (
    <>
      <PageHeader title="Audit log" description="Visible to administrators only." />
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Item</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {error && <TableRow><TableCell colSpan={5}>{(error as Error).message}</TableCell></TableRow>}
            {data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No activity recorded, or you don't have access.</TableCell></TableRow>}
            {data?.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-sm">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{l.email}</TableCell>
                <TableCell className="text-sm font-medium">{l.action}</TableCell>
                <TableCell className="text-sm">{l.entity_type}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.details}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
