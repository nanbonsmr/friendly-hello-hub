CREATE TYPE public.app_role AS ENUM ('super_admin','admin','content_manager','editor','moderator','finance_manager','analyst','author');
CREATE TYPE public.book_status AS ENUM ('draft','in_review','scheduled','published','unpublished','archived');
CREATE TYPE public.chapter_status AS ENUM ('draft','in_review','scheduled','published','unpublished');
CREATE TYPE public.access_type AS ENUM ('free','paid','subscription','per_chapter');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, display_name text, avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated; GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','admin')) $$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;
CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','admin','content_manager','editor')) $$;

CREATE POLICY "Own or staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "Own or admin update profiles" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Own or admin read roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admins grant roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND (role <> 'super_admin' OR public.has_role(auth.uid(),'super_admin')));
CREATE POLICY "Admins revoke roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) AND (role <> 'super_admin' OR public.has_role(auth.uid(),'super_admin')));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE, description text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, bio text, email text, photo_url text, user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, subtitle text, slug text NOT NULL UNIQUE, description text, cover_url text,
  language text NOT NULL DEFAULT 'en', isbn text,
  genre_id uuid REFERENCES public.genres(id) ON DELETE SET NULL,
  status public.book_status NOT NULL DEFAULT 'draft',
  access_type public.access_type NOT NULL DEFAULT 'free',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  published_at timestamptz, scheduled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX books_status_idx ON public.books(status);
CREATE TABLE public.book_authors (
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, author_id)
);
CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  number integer NOT NULL, title text NOT NULL, content text NOT NULL DEFAULT '',
  status public.chapter_status NOT NULL DEFAULT 'draft',
  is_free boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  word_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, number)
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.genres, public.books, public.book_authors, public.chapters, public.authors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genres, public.books, public.book_authors, public.chapters, public.authors TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.genres, public.books, public.book_authors, public.chapters, public.authors, public.audit_logs TO service_role;

ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads genres" ON public.genres FOR SELECT USING (true);
CREATE POLICY "Editors write genres" ON public.genres FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors update genres" ON public.genres FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins delete genres" ON public.genres FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone reads authors" ON public.authors FOR SELECT USING (true);
CREATE POLICY "Editors write authors" ON public.authors FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors update authors" ON public.authors FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins delete authors" ON public.authors FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Public reads published books" ON public.books FOR SELECT USING (status = 'published' OR public.is_staff(auth.uid()));
CREATE POLICY "Editors create books" ON public.books FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors update books" ON public.books FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins delete books" ON public.books FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Read book authors" ON public.book_authors FOR SELECT USING (true);
CREATE POLICY "Editors link authors" ON public.book_authors FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors unlink authors" ON public.book_authors FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

CREATE POLICY "Public reads published chapters" ON public.chapters FOR SELECT USING (public.is_staff(auth.uid()) OR (status = 'published' AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_id AND b.status = 'published')));
CREATE POLICY "Editors create chapters" ON public.chapters FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors update chapters" ON public.chapters FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors delete chapters" ON public.chapters FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff write audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());

CREATE TRIGGER genres_updated BEFORE UPDATE ON public.genres FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER authors_updated BEFORE UPDATE ON public.authors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER books_updated BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER chapters_updated BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();