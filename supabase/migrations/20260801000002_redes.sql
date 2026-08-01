-- Redes module: social posting calendar. Admin-only end to end (the config
-- row holds an AI API key). Inert for instances without the module.

create table if not exists public.social_config (
  id boolean primary key default true check (id),
  business_name text not null default 'MARLA',
  logo_url text not null default '',
  style_prompt text not null default '',
  provider text not null default 'none' check (provider in ('none','gemini','openai','anthropic')),
  api_key text not null default '',
  cadence_days integer not null default 7 check (cadence_days >= 1 and cadence_days <= 60),
  posts_per_batch integer not null default 7 check (posts_per_batch >= 1 and posts_per_batch <= 30),
  post_time text not null default '19:00',
  platforms text[] not null default '{instagram,facebook}',
  last_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  item_name text not null,
  images text[] not null default '{}',
  caption text not null default '',
  design jsonb not null default '{}',
  scheduled_at timestamptz not null,
  platforms text[] not null default '{instagram,facebook}',
  status text not null default 'planned' check (status in ('planned','posted','confirmed')),
  posted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_scheduled_at_idx on public.social_posts (scheduled_at);
create index if not exists social_posts_pending_idx on public.social_posts (scheduled_at) where status <> 'confirmed';

create table if not exists public.social_promoted (
  item_id uuid primary key references public.items(id) on delete cascade,
  last_promoted_at timestamptz not null default now()
);

-- ── RLS: admin only, the config row carries an API key ─────────────────────
alter table public.social_config enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_promoted enable row level security;

create policy social_config_select_admin on public.social_config
  for select to authenticated using (is_admin());
create policy social_config_insert_admin on public.social_config
  for insert to authenticated with check (is_admin());
create policy social_config_update_admin on public.social_config
  for update to authenticated using (is_admin()) with check (is_admin());
create policy social_config_delete_admin on public.social_config
  for delete to authenticated using (is_admin());

create policy social_posts_select_admin on public.social_posts
  for select to authenticated using (is_admin());
create policy social_posts_insert_admin on public.social_posts
  for insert to authenticated with check (is_admin());
create policy social_posts_update_admin on public.social_posts
  for update to authenticated using (is_admin()) with check (is_admin());
create policy social_posts_delete_admin on public.social_posts
  for delete to authenticated using (is_admin());

create policy social_promoted_select_admin on public.social_promoted
  for select to authenticated using (is_admin());
create policy social_promoted_insert_admin on public.social_promoted
  for insert to authenticated with check (is_admin());
create policy social_promoted_update_admin on public.social_promoted
  for update to authenticated using (is_admin()) with check (is_admin());
create policy social_promoted_delete_admin on public.social_promoted
  for delete to authenticated using (is_admin());

-- ── storage + default config row ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('social-posts', 'social-posts', true)
on conflict (id) do nothing;

insert into public.social_config (id) values (true)
on conflict (id) do nothing;
