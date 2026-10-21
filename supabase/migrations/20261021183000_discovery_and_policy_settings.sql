-- Aggregate-only public book signals for discovery sorting. No reader identifiers
-- or individual reading events are exposed through this view.
CREATE OR REPLACE VIEW public.book_discovery_stats WITH (security_barrier = true) AS
SELECT b.id AS book_id,
  coalesce(r.average_rating, 0)::numeric(4,2) AS average_rating,
  coalesce(r.review_count, 0)::bigint AS review_count,
  coalesce(e.open_count, 0)::bigint AS open_count
FROM public.books b
LEFT JOIN LATERAL (
  SELECT avg(rating) AS average_rating, count(*) AS review_count
  FROM public.reviews WHERE book_id = b.id AND status = 'visible'
) r ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS open_count FROM public.reading_events WHERE book_id = b.id AND event_type = 'open' AND created_at >= now() - interval '7 days'
) e ON true
WHERE b.status = 'published';
GRANT SELECT ON public.book_discovery_stats TO anon, authenticated;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS privacy_policy_url text,
  ADD COLUMN IF NOT EXISTS terms_of_service_url text;

-- Keep review approval enforced in the database even if an untrusted client
-- tries to write a visible status directly.
CREATE OR REPLACE FUNCTION public.enforce_reader_review_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  settings public.platform_settings%ROWTYPE;
BEGIN
  IF public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  SELECT * INTO settings FROM public.platform_settings WHERE id = 1;
  IF NOT coalesce(settings.reviews_enabled, true) THEN
    RAISE EXCEPTION 'Reviews are currently disabled';
  END IF;
  IF coalesce(settings.require_review_approval, false) THEN NEW.status := 'pending';
  ELSE NEW.status := 'visible'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_reader_review_settings ON public.reviews;
CREATE TRIGGER enforce_reader_review_settings
  BEFORE INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reader_review_settings();
