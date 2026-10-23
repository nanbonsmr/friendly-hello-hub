-- A receipt is only a successful purchase when both the order and its
-- reader entitlement commit. Keep those writes in one transaction.
CREATE OR REPLACE FUNCTION public.complete_verified_payment(
  p_order_id uuid,
  p_provider text,
  p_receipt_source text,
  p_receipt_reference text,
  p_payer_name text,
  p_receiver_name text,
  p_paid_cents integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO payment_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR payment_order.status <> 'pending'
     OR (payment_order.book_id IS NULL AND payment_order.chapter_id IS NULL) THEN
    RAISE EXCEPTION 'This payment is no longer awaiting verification.' USING ERRCODE = '22023';
  END IF;
  IF p_paid_cents IS NULL OR p_paid_cents < payment_order.amount_cents THEN
    RAISE EXCEPTION 'The verified amount does not cover the order.' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_reference IS NULL OR btrim(p_receipt_reference) = '' THEN
    RAISE EXCEPTION 'A transaction reference is required.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = 'paid', paid_cents = p_paid_cents, provider = p_provider,
      receipt_source = p_receipt_source, receipt_reference = p_receipt_reference,
      payer_name = p_payer_name, receiver_name = p_receiver_name,
      verified_at = now(), rejection_reason = NULL
  WHERE id = p_order_id;

  INSERT INTO public.entitlements (user_id, book_id, chapter_id, order_id)
  VALUES (payment_order.user_id, payment_order.book_id, payment_order.chapter_id, payment_order.id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_payment(uuid, text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_payment(uuid, text, text, text, text, text, integer) TO service_role;
