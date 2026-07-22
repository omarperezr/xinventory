-- ---------------------------------------------------------------------------
-- Redes Sociales module: scheduled social media posts generated from inventory.
--
-- The business sells through Instagram/Facebook, not through a storefront
-- website. Posting consistently is the marketing strategy, and until now it
-- was a manual Claude Code session (see marketing_posts/PROMPT.md) that read
-- `items`, composed 1080x1350 post images in an approved style, and wrote
-- captions. This module makes that a recurring, configurable workflow:
--
--   * `social_config` (single row) holds everything an admin can tune: the
--     business identity (name, logo), the style prompt handed to the AI
--     provider, which provider and API key to use, how often a batch is
--     generated, how many posts per batch, and the default posting time.
--     The API key lives here, so BOTH tables are admin-only even for SELECT
--     (unlike inventory, sellers have no business in the marketing calendar).
--   * `social_posts` is the calendar. One row per planned post: the product it
--     promotes, the enhanced photos (public storage URLs), the caption, the
--     design texts the client-side composer renders (title stack, callouts,
--     statement), when and where it should be posted, and how far along the
--     manual posting flow it is: planned -> posted -> confirmed.
--   * `social_promoted` remembers when each item was last promoted. It exists
--     because confirmed posts are DELETED once their week ends (the calendar
--     is a working surface, not an archive), and batch generation still needs
--     "least recently promoted" to rotate the catalog fairly.
--
-- Posting itself stays manual by design: the admin downloads the composed
-- image, posts it, then marks the row posted/confirmed. Generation and weekly
-- cleanup run in the Vercel function api/social-generate.ts with the service
-- role key, so RLS here only guards the browser client.
--
-- This migration is additive and can be undone with 0005_rollback.sql.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Module configuration (single row, admin-only)
-- ---------------------------------------------------------------------------
-- `id boolean primary key default true check (id)` is the single-row trick:
-- the only possible key is `true`, so upserts always land on the same row.
create table if not exists public.social_config (
  id boolean primary key default true check (id),
  business_name text not null default 'MARLA',
  -- Public storage URL of the brand logo (transparent PNG). Uploaded from the
  -- config panel with the same compressor the inventory form uses.
  logo_url text not null default '',
  -- Free-form creative direction pasted into every AI request: tone, style,
  -- what to emphasize. The approved style guide lives in the app as the
  -- default; the admin can evolve it without a deploy.
  style_prompt text not null default '',
  provider text not null default 'none'
    check (provider in ('none', 'gemini', 'openai', 'anthropic')),
  api_key text not null default '',
  -- A batch is generated when `now() - last_generated_at >= cadence_days`.
  -- The Vercel cron fires daily; this decides whether it actually runs.
  cadence_days integer not null default 7 check (cadence_days between 1 and 60),
  posts_per_batch integer not null default 7
    check (posts_per_batch between 1 and 30),
  -- Local posting time (America/Caracas) as HH:MM, one post per day starting
  -- the day after generation.
  post_time text not null default '19:00',
  platforms text[] not null default '{instagram,facebook}',
  last_generated_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------------
-- The calendar
-- ---------------------------------------------------------------------------
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  -- `set null` and a denormalized name: the post survives the product being
  -- deleted (it may already be printed on a phone screen somewhere).
  item_id uuid references public.items(id) on delete set null,
  item_name text not null,
  -- Enhanced product photos (public storage URLs in the social-posts bucket).
  -- The final 1080x1350 image is composed client-side from these plus
  -- `design`, so regenerating a look never re-costs an AI call.
  images text[] not null default '{}',
  caption text not null default '',
  -- Texts for the deterministic composer, produced by the AI (or fallback
  -- templates): { "t1": category line, "t2": big brand/model line,
  -- "t3": variant subtitle, "callouts": ["..."], "statement": slogan }.
  design jsonb not null default '{}'::jsonb,
  scheduled_at timestamp with time zone not null,
  platforms text[] not null default '{instagram,facebook}',
  -- planned:   generated, waiting for its date.
  -- posted:    the admin says it went up on the networks.
  -- confirmed: double-checked; eligible for cleanup once its week ends.
  status text not null default 'planned'
    check (status in ('planned', 'posted', 'confirmed')),
  posted_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists social_posts_scheduled_at_idx
  on public.social_posts (scheduled_at);

-- The calendar mostly asks "what is still pending"; confirmed rows are on
-- their way out of the table entirely.
create index if not exists social_posts_pending_idx
  on public.social_posts (scheduled_at)
  where status <> 'confirmed';

-- ---------------------------------------------------------------------------
-- Rotation memory
-- ---------------------------------------------------------------------------
-- Survives the weekly deletion of confirmed posts; without it, cleanup would
-- erase the very information rotation needs.
create table if not exists public.social_promoted (
  item_id uuid primary key references public.items(id) on delete cascade,
  last_promoted_at timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security: admin-only, including SELECT.
-- ---------------------------------------------------------------------------
-- social_config holds an API key and social_posts is an admin working surface;
-- neither should be visible to seller accounts. The generation endpoint uses
-- the service role key and bypasses RLS.
alter table public.social_config enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_promoted enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'social_config',
    'social_posts',
    'social_promoted'
  ]
  loop
    execute format('drop policy if exists %1$s_select_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_select_admin on public.%1$s
         for select to authenticated using (public.is_admin())', t);

    execute format('drop policy if exists %1$s_insert_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_insert_admin on public.%1$s
         for insert to authenticated with check (public.is_admin())', t);

    execute format('drop policy if exists %1$s_update_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_update_admin on public.%1$s
         for update to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);

    execute format('drop policy if exists %1$s_delete_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_delete_admin on public.%1$s
         for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;

-- Storage note, following 0001's precedent: buckets are not SQL. The
-- generation endpoint creates the public `social-posts` bucket on first run
-- via the service role (createBucket if missing). Dashboard limits worth
-- setting by hand:
--   Storage > social-posts > Settings
--     file size limit:      3 MB
--     allowed MIME types:   image/webp, image/jpeg, image/png

commit;
