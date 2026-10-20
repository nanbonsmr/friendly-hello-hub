// Server-only: verifies bank receipts through links.et and records orders + entitlements.
// Never log receipt URLs — they act as credentials for the payer's transaction.

type Receipt = Record<string, unknown> & { source?: string };

export type PurchaseItem = { bookId?: string | undefined; chapterId?: string | undefined };

export type VerifyResult =
  | { ok: true; orderId: string; itemTitle: string; paid: number; currency: string }
  | { ok: false; reason: string; orderId?: string };

/** Parse amounts that may be numbers or strings like "100 Birr" / "1,250.50 ETB". */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function findField(obj: unknown, keys: string[], depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 3) return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) if (rec[k] != null && rec[k] !== "") return rec[k];
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const f = findField(v, keys, depth + 1);
      if (f != null) return f;
    }
  }
  return undefined;
}

/** Normalise the provider-specific receipt into the fields we check. */
export function normaliseReceipt(r: Receipt) {
  const amount = parseAmount(findField(r, ["settledAmount", "transferredAmount", "creditAmount", "amount", "totalPaidAmount", "totalAmount"]));
  const receiver = findField(r, ["creditedPartyName", "receiverName", "beneficiaryName", "creditedName", "toName", "receiver"]);
  const payer = findField(r, ["payerName", "senderName", "debitedName", "fromName", "payer"]);
  const reference = findField(r, ["receiptNo", "reference", "transactionReference", "transactionId", "referenceNo"]);
  const status = findField(r, ["transactionStatus", "status"]);
  return {
    source: String(r.source ?? "unknown"),
    amount,
    receiver: typeof receiver === "string" ? receiver : null,
    payer: typeof payer === "string" ? payer : null,
    reference: reference != null ? String(reference) : null,
    status: typeof status === "string" ? status : null,
  };
}

export function receiverMatches(receiver: string | null, allowed: string[]) {
  if (allowed.length === 0) return true;
  if (!receiver) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u1200-\u137f]+/g, " ").trim();
  const r = norm(receiver);
  return allowed.some((a) => { const n = norm(a); return n.length > 0 && (r.includes(n) || n.includes(r)); });
}

export function statusOk(status: string | null) {
  if (!status) return true;
  return /complet|success|paid|approved|done/i.test(status);
}

async function callLinksEt(receiptUrl: string): Promise<{ ok: true; receipt: Receipt } | { ok: false; reason: string }> {
  const key = process.env["LINKS_ET_API_KEY"];
  if (!key) return { ok: false, reason: "Payment verification is not configured." };
  let res: Response;
  try {
    res = await fetch("https://links.et/api/verify", {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json", "Idempotency-Key": await hash(receiptUrl) },
      body: JSON.stringify({ url: receiptUrl }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    return { ok: false, reason: "The bank took too long to answer. Please try again in a minute." };
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; receipt?: Receipt; error?: { code?: string } | string | null } | null;
  if (res.ok && body?.ok && body.receipt) return { ok: true, receipt: body.receipt };
  const code = typeof body?.error === "object" ? body?.error?.code : undefined;
  console.error(`links.et verify failed: status=${res.status} code=${code ?? "none"}`);
  if (res.status === 401) return { ok: false, reason: "Payment verification key is invalid. Contact support." };
  if (res.status === 429 && code === "quota_exceeded") return { ok: false, reason: "Verification limit reached for this month. Contact support." };
  if (res.status === 429) return { ok: false, reason: "Too many attempts. Please wait a minute and try again." };
  if (res.status === 502) return { ok: false, reason: "The bank's receipt could not be confirmed. Check the link and try again." };
  return { ok: false, reason: "We couldn't read this receipt. Check the link is a full bank or telebirr receipt URL." };
}

async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify a receipt for a reader's purchase; creates an order and, if valid, an entitlement. */
export async function verifyPurchase(userId: string, item: PurchaseItem, receiptUrl: string): Promise<VerifyResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  // 1. Work out the price on the server.
  let title = "";
  let priceCents = 0;
  let currency = "ETB";
  let bookId: string | null = null;
  let chapterId: string | null = null;
  if (item.chapterId) {
    const { data: ch } = await db.from("chapters").select("id,title,number,is_free,price_cents,book_id,books(title,currency,status,scheduled_at)").eq("id", item.chapterId).maybeSingle();
    if (!ch || !ch.books) return { ok: false, reason: "Chapter not found." };
    if (ch.is_free || ch.price_cents <= 0) return { ok: false, reason: "This chapter is free." };
    title = `${ch.books.title} — Ch ${ch.number}: ${ch.title}`;
    priceCents = ch.price_cents;
    currency = ch.books.currency;
    chapterId = ch.id;
    bookId = ch.book_id;
  } else if (item.bookId) {
    const { data: b } = await db.from("books").select("id,title,access_type,price_cents,currency").eq("id", item.bookId).maybeSingle();
    if (!b) return { ok: false, reason: "Book not found." };
    if (b.access_type !== "paid" || b.price_cents <= 0) return { ok: false, reason: "This book is not sold individually." };
    title = b.title;
    priceCents = b.price_cents;
    currency = b.currency;
    bookId = b.id;
  } else return { ok: false, reason: "Choose a book or chapter." };
  if (currency !== "ETB") return { ok: false, reason: "This item is not priced in Birr (ETB)." };

  // 2. Already owned?
  const owned = db.from("entitlements").select("id").eq("user_id", userId).is("revoked_at", null);
  const { data: existing } = chapterId ? await owned.eq("chapter_id", chapterId).limit(1) : await owned.eq("book_id", bookId!).is("chapter_id", null).limit(1);
  if (existing && existing.length) return { ok: false, reason: "You already own this." };

  const { data: order, error: oErr } = await db.from("orders").insert({ user_id: userId, book_id: bookId, chapter_id: chapterId, item_title: title, amount_cents: priceCents, currency }).select("id").single();
  if (oErr || !order) return { ok: false, reason: "Could not start the order." };
  const reject = async (reason: string, extra: Record<string, unknown> = {}) => {
    await db.from("orders").update({ status: "rejected", rejection_reason: reason, ...extra }).eq("id", order.id);
    return { ok: false as const, reason, orderId: order.id };
  };

  // 3. Ask the bank via links.et.
  const v = await callLinksEt(receiptUrl);
  if (!v.ok) return reject(v.reason);
  const r = normaliseReceipt(v.receipt);
  const extra = { provider: r.source.split("-")[0], receipt_source: r.source, receipt_reference: r.reference, payer_name: r.payer, receiver_name: r.receiver, paid_cents: r.amount != null ? Math.round(r.amount * 100) : null };

  // 4. Check it.
  if (!r.reference) return reject("The receipt has no transaction reference.", extra);
  if (!statusOk(r.status)) return reject("The bank says this transaction is not completed.", extra);
  const { data: s } = await db.from("platform_settings").select("payment_receiver_names").eq("id", 1).single();
  const allowed = (s?.payment_receiver_names ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (!receiverMatches(r.receiver, allowed)) return reject("This payment was not sent to our account.", extra);
  if (r.amount == null || Math.round(r.amount * 100) < priceCents) return reject(`Amount paid is less than the price (${(priceCents / 100).toFixed(2)} ETB).`, extra);

  // 5. Mark paid (unique index blocks a receipt being reused) and grant access.
  const { error: pErr } = await db.from("orders").update({ status: "paid", verified_at: new Date().toISOString(), ...extra }).eq("id", order.id);
  if (pErr) return reject(pErr.code === "23505" ? "This receipt has already been used." : "Could not record the payment.", { ...extra, receipt_reference: null });
  await db.from("entitlements").insert({ user_id: userId, book_id: bookId, chapter_id: chapterId, order_id: order.id });
  return { ok: true, orderId: order.id, itemTitle: title, paid: r.amount, currency };
}
