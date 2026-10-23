ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS telebirr_phone_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_path text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_path_uidx
  ON public.orders (receipt_path) WHERE receipt_path IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 8000000, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Readers upload own payment receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Readers and finance view payment receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.can_manage_finance(auth.uid())));

CREATE OR REPLACE FUNCTION public.submit_uploaded_payment(p_book_id uuid, p_chapter_id uuid, p_receipt_path text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  reader_id uuid := auth.uid();
  target_book_id uuid;
  amount integer;
  currency_code text;
  item_label text;
  result_id uuid;
BEGIN
  IF reader_id IS NULL THEN
    RAISE EXCEPTION 'Sign in required.' USING ERRCODE = '42501';
  END IF;
  IF num_nonnulls(p_book_id, p_chapter_id) <> 1 THEN
    RAISE EXCEPTION 'Choose exactly one book or chapter.' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_path IS NULL OR split_part(p_receipt_path, '/', 1) <> reader_id::text
     OR p_receipt_path LIKE '%..%' OR length(p_receipt_path) <= length(reader_id::text) + 1
     OR strpos(substring(p_receipt_path FROM length(reader_id::text) + 2), '/') > 0 THEN
    RAISE EXCEPTION 'Invalid receipt image.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'payment-receipts' AND o.name = p_receipt_path
  ) THEN
    RAISE EXCEPTION 'Receipt image not found. Upload it again.' USING ERRCODE = '22023';
  END IF;

  IF p_chapter_id IS NOT NULL THEN
    SELECT c.book_id, c.price_cents, b.currency, b.title || ' — Ch ' || c.number || ': ' || c.title
      INTO target_book_id, amount, currency_code, item_label
      FROM public.chapters c JOIN public.books b ON b.id = c.book_id
      WHERE c.id = p_chapter_id AND c.status = 'published' AND b.status = 'published';
    IF NOT FOUND THEN RAISE EXCEPTION 'Chapter is unavailable.' USING ERRCODE = '22023'; END IF;
    IF amount <= 0 THEN RAISE EXCEPTION 'This chapter is free.' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id = reader_id AND e.revoked_at IS NULL
      AND e.book_id = target_book_id AND (e.chapter_id IS NULL OR e.chapter_id = p_chapter_id)) THEN
      RAISE EXCEPTION 'You already own this chapter.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT b.id, b.price_cents, b.currency, b.title
      INTO target_book_id, amount, currency_code, item_label
      FROM public.books b WHERE b.id = p_book_id AND b.status = 'published' AND b.access_type = 'paid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Book is unavailable for individual purchase.' USING ERRCODE = '22023'; END IF;
    IF amount <= 0 THEN RAISE EXCEPTION 'This book is not sold individually.' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id = reader_id AND e.revoked_at IS NULL
      AND e.book_id = target_book_id AND e.chapter_id IS NULL) THEN
      RAISE EXCEPTION 'You already own this book.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF currency_code <> 'ETB' THEN RAISE EXCEPTION 'This item is not priced in ETB.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.orders (user_id, book_id, chapter_id, item_title, amount_cents, currency, status, provider, receipt_path)
    VALUES (reader_id, target_book_id, p_chapter_id, item_label, amount, currency_code, 'pending', 'manual-review', p_receipt_path)
    RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_uploaded_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_uploaded_payment(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_uploaded_payment(p_order_id uuid, p_approved boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.can_manage_finance(auth.uid()) THEN
    RAISE EXCEPTION 'Only finance staff can review uploaded payment proofs.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO payment_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR payment_order.status <> 'pending' OR payment_order.receipt_path IS NULL THEN
    RAISE EXCEPTION 'This uploaded payment is no longer awaiting review.' USING ERRCODE = '22023';
  END IF;

  IF p_approved THEN
    UPDATE public.orders
      SET status = 'paid', paid_cents = amount_cents, provider = 'manual-review',
          receipt_source = 'uploaded-proof', verified_at = now(), rejection_reason = NULL
      WHERE id = p_order_id;
    INSERT INTO public.entitlements (user_id, book_id, chapter_id, order_id)
      VALUES (payment_order.user_id, payment_order.book_id, payment_order.chapter_id, payment_order.id);
  ELSE
    UPDATE public.orders
      SET status = 'rejected', rejection_reason = coalesce(nullif(trim(p_reason), ''), 'Receipt could not be confirmed.')
      WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_uploaded_payment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_uploaded_payment(uuid, boolean, text) TO authenticated;
