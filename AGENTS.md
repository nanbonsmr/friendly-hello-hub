<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Admin pages live under `src/routes/_authenticated/` and talk to Supabase with the browser client; permissions are enforced by RLS via `has_role`/`is_admin`/`is_staff`/`can_edit_content` SQL helpers — why: UI checks alone are bypassable.
- Staff roles live only in `public.user_roles`; the first signup is auto-granted `super_admin` by the `handle_new_user` trigger — why: avoids privilege escalation through editable profile data.
- Shared admin helpers (role query, slug, price, audit logging) live in `src/lib/admin.ts`; shell/layout components in `src/components/admin-shell.tsx`.
- Payments are bank/telebirr receipt verification via links.et (`src/lib/payments.server.ts`); orders/entitlements are written only server-side with the admin client after the receipt checks pass — why: readers must not grant themselves access. Never log receipt URLs.
- Reader-app reading events arrive through the bearer-verified public route `src/routes/api/public/analytics/events.ts` into `public.reading_events`; admin analytics reads the `*_reading_stats` security-invoker views — why: readers are untrusted callers and stats must respect RLS.
