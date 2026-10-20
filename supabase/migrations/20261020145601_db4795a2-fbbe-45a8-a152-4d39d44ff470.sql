ALTER TABLE public.books ALTER COLUMN currency SET DEFAULT 'ETB';
UPDATE public.books SET currency = 'ETB' WHERE currency = 'USD';
ALTER TABLE public.subscription_plans ALTER COLUMN currency SET DEFAULT 'ETB';
UPDATE public.subscription_plans SET currency = 'ETB' WHERE currency = 'USD';
ALTER TABLE public.platform_settings ALTER COLUMN default_currency SET DEFAULT 'ETB';
UPDATE public.platform_settings SET default_currency = 'ETB' WHERE default_currency = 'USD';
ALTER TABLE public.platform_settings ADD COLUMN payment_receiver_names text, ADD COLUMN payment_instructions text;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  item_title text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  paid_cents integer,
  currency text NOT NULL DEFAULT 'ETB',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected','refunded')),
  provider text, receipt_source text, receipt_reference text,
  payer_name text, receiver_name text, rejection_reason text,
  verified_at timestamptz, refunded_at timestamptz, refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_receipt_ref_paid_uidx ON public.orders (receipt_source, receipt_reference) WHERE status IN ('paid','refunded') AND receipt_reference IS NOT NULL;
CREATE INDEX orders_user_idx ON public.orders(user_id, created_at DESC);

CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (book_id IS NOT NULL OR chapter_id IS NOT NULL)
);
CREATE INDEX entitlements_user_idx ON public.entitlements(user_id);

GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, UPDATE ON public.entitlements TO authenticated;
GRANT ALL ON public.orders, public.entitlements TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or finance reads orders" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_finance(auth.uid()) OR public.has_role(auth.uid(),'analyst'));
CREATE POLICY "Finance updates orders" ON public.orders FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid()));
CREATE POLICY "Own or finance reads entitlements" ON public.entitlements FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_finance(auth.uid()));
CREATE POLICY "Finance updates entitlements" ON public.entitlements FOR UPDATE TO authenticated USING (public.can_manage_finance(auth.uid()));
CREATE TRIGGER t_orders_upd BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();