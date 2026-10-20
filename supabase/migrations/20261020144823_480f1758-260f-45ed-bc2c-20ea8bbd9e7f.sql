-- active-aware role helpers
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.user_id = _user_id AND p.is_active) $$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.user_id = _user_id AND p.is_active AND r.role IN ('super_admin','admin')) $$;
CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.user_id = _user_id AND p.is_active AND r.role IN ('super_admin','admin','content_manager','editor')) $$;
CREATE OR REPLACE FUNCTION public.can_moderate(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.user_id = _user_id AND p.is_active AND r.role IN ('super_admin','admin','moderator')) $$;
CREATE OR REPLACE FUNCTION public.can_manage_finance(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.user_id = _user_id AND p.is_active AND r.role IN ('super_admin','admin','finance_manager')) $$;
REVOKE EXECUTE ON FUNCTION public.can_moderate(uuid), public.can_manage_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate(uuid), public.can_manage_finance(uuid) TO authenticated;

ALTER TABLE public.chapters ADD COLUMN scheduled_at timestamptz;

-- subscriptions
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0), currency text NOT NULL DEFAULT 'USD',
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')), is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  current_period_start timestamptz NOT NULL DEFAULT now(), current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, description text,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','amount')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  starts_at timestamptz, ends_at timestamptz, max_uses integer, uses integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- series
CREATE TABLE public.series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, description text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.series_books (
  series_id uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1, PRIMARY KEY (series_id, book_id));
-- rights
CREATE TABLE public.book_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  rights_holder text NOT NULL, license_type text NOT NULL DEFAULT 'exclusive', territory text NOT NULL DEFAULT 'Worldwide',
  starts_on date, ends_on date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- reviews & reports
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5), body text,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('pending','visible','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (book_id, user_id));
CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('book','chapter','review')), target_id uuid NOT NULL,
  reason text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolution_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- support
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, body text NOT NULL, is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
-- revisions
CREATE TABLE public.chapter_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title text NOT NULL, content text NOT NULL, content_type text NOT NULL, pdf_path text, pdf_name text, word_count integer NOT NULL DEFAULT 0,
  edited_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX chapter_revisions_chapter_idx ON public.chapter_revisions(chapter_id, created_at DESC);
-- settings
CREATE TABLE public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), platform_name text NOT NULL DEFAULT 'Hawwii',
  support_email text, default_currency text NOT NULL DEFAULT 'USD', default_chapter_price_cents integer NOT NULL DEFAULT 0,
  free_preview_chapters integer NOT NULL DEFAULT 1, reviews_enabled boolean NOT NULL DEFAULT true,
  require_review_approval boolean NOT NULL DEFAULT false, maintenance_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.platform_settings (id) VALUES (1);

-- grants
GRANT SELECT ON public.subscription_plans, public.series, public.series_books, public.reviews, public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans, public.subscriptions, public.promotions, public.series, public.series_books, public.book_rights, public.reviews, public.content_reports, public.support_tickets, public.support_messages, public.chapter_revisions TO authenticated;
GRANT SELECT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.subscription_plans, public.subscriptions, public.promotions, public.series, public.series_books, public.book_rights, public.reviews, public.content_reports, public.support_tickets, public.support_messages, public.chapter_revisions, public.platform_settings TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon reads active plans" ON public.subscription_plans FOR SELECT TO anon USING (is_active);
CREATE POLICY "Auth reads plans" ON public.subscription_plans FOR SELECT TO authenticated USING (is_active OR public.is_staff(auth.uid()));
CREATE POLICY "Finance manages plans" ON public.subscription_plans FOR ALL TO authenticated USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));

CREATE POLICY "Own or finance reads subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_finance(auth.uid()) OR public.has_role(auth.uid(),'analyst'));
CREATE POLICY "Finance manages subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (public.can_manage_finance(auth.uid())) WITH CHECK (public.can_manage_finance(auth.uid()));

CREATE POLICY "Staff reads promotions" ON public.promotions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Finance manages promotions" ON public.promotions FOR ALL TO authenticated USING (public.can_manage_finance(auth.uid()) OR public.has_role(auth.uid(),'content_manager')) WITH CHECK (public.can_manage_finance(auth.uid()) OR public.has_role(auth.uid(),'content_manager'));

CREATE POLICY "Anyone reads series" ON public.series FOR SELECT USING (true);
CREATE POLICY "Editors manage series" ON public.series FOR ALL TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Anyone reads series books" ON public.series_books FOR SELECT USING (true);
CREATE POLICY "Editors manage series books" ON public.series_books FOR ALL TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));

CREATE POLICY "Staff reads rights" ON public.book_rights FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Editors manage rights" ON public.book_rights FOR ALL TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));

CREATE POLICY "Anon reads visible reviews" ON public.reviews FOR SELECT TO anon USING (status = 'visible');
CREATE POLICY "Auth reads reviews" ON public.reviews FOR SELECT TO authenticated USING (status = 'visible' OR user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Readers write own review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner or moderator updates review" ON public.reviews FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Owner or moderator deletes review" ON public.reviews FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.can_moderate(auth.uid()));

CREATE POLICY "Own or moderator reads reports" ON public.content_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.can_moderate(auth.uid()));
CREATE POLICY "Readers file reports" ON public.content_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Moderators update reports" ON public.content_reports FOR UPDATE TO authenticated USING (public.can_moderate(auth.uid()));
CREATE POLICY "Moderators delete reports" ON public.content_reports FOR DELETE TO authenticated USING (public.can_moderate(auth.uid()));

CREATE POLICY "Own or staff reads tickets" ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Users open tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff update tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins delete tickets" ON public.support_tickets FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Ticket parties read messages" ON public.support_messages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Ticket parties write messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND ((is_staff AND public.is_staff(auth.uid())) OR (NOT is_staff AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()))));

CREATE POLICY "Staff reads revisions" ON public.chapter_revisions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Editors write revisions" ON public.chapter_revisions FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins delete revisions" ON public.chapter_revisions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone reads settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins update settings" ON public.platform_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER t_plans_upd BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_subs_upd BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_promos_upd BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_series_upd BEFORE UPDATE ON public.series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_rights_upd BEFORE UPDATE ON public.book_rights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_reviews_upd BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_reports_upd BEFORE UPDATE ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_tickets_upd BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_settings_upd BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chapter revision snapshot
CREATE OR REPLACE FUNCTION public.snapshot_chapter_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title OR OLD.pdf_path IS DISTINCT FROM NEW.pdf_path THEN
    INSERT INTO public.chapter_revisions (chapter_id, title, content, content_type, pdf_path, pdf_name, word_count, edited_by)
    VALUES (OLD.id, OLD.title, OLD.content, OLD.content_type, OLD.pdf_path, OLD.pdf_name, OLD.word_count, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER chapters_revision BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.snapshot_chapter_revision();

-- scheduled publishing: content becomes live automatically once its scheduled time passes (derived at read time)
CREATE OR REPLACE FUNCTION public.is_live(_status text, _scheduled_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _status = 'published' OR (_status = 'scheduled' AND _scheduled_at IS NOT NULL AND _scheduled_at <= now()) $$;
DROP POLICY "Anon reads published books" ON public.books;
DROP POLICY "Auth reads books" ON public.books;
CREATE POLICY "Anon reads live books" ON public.books FOR SELECT TO anon USING (public.is_live(status::text, scheduled_at));
CREATE POLICY "Auth reads books" ON public.books FOR SELECT TO authenticated USING (public.is_live(status::text, scheduled_at) OR public.is_staff(auth.uid()));
DROP POLICY "Anon reads published chapters" ON public.chapters;
DROP POLICY "Auth reads chapters" ON public.chapters;
CREATE POLICY "Anon reads live chapters" ON public.chapters FOR SELECT TO anon USING (public.is_live(status::text, scheduled_at) AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND public.is_live(b.status::text, b.scheduled_at)));
CREATE POLICY "Auth reads chapters" ON public.chapters FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR (public.is_live(status::text, scheduled_at) AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND public.is_live(b.status::text, b.scheduled_at))));