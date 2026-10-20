import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyPurchase } from "./payments.server";

const receipt = z.string().url().max(2000);

/** A signed-in reader submits their own receipt. */
export const submitReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookId: z.string().uuid().optional(), chapterId: z.string().uuid().optional(), receiptUrl: receipt }).parse(d))
  .handler(async ({ data, context }) => verifyPurchase(context.userId, { bookId: data.bookId, chapterId: data.chapterId }, data.receiptUrl));

/** Finance staff record a payment on behalf of a reader (e.g. receipt sent via support). */
export const recordReaderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email(), bookId: z.string().uuid().optional(), chapterId: z.string().uuid().optional(), receiptUrl: receipt }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: can } = await context.supabase.rpc("can_manage_finance", { _user_id: context.userId });
    if (!can) throw new Error("Only finance staff can record payments.");
    const { data: reader } = await context.supabase.from("profiles").select("id").ilike("email", data.email).maybeSingle();
    if (!reader) return { ok: false as const, reason: "No reader account with that email." };
    const res = await verifyPurchase(reader.id, { bookId: data.bookId, chapterId: data.chapterId }, data.receiptUrl);
    await context.supabase.from("audit_logs").insert({ actor_id: context.userId, action: "record_payment", entity_type: "order", entity_id: res.orderId ?? null, details: res.ok ? `paid ${data.email}` : `rejected: ${res.reason}` });
    return res;
  });
