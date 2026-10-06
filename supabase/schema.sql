-- Prompt Library table for the AI Instagram Scheduler.
-- Paste into the Supabase SQL editor and run once. The app never runs this automatically.

create extension if not exists pgcrypto; -- gen_random_uuid() (already enabled on Supabase)

create table if not exists public.saved_prompts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) between 1 and 120),
  prompt_text        text not null check (length(btrim(prompt_text)) between 1 and 3000),
  category           text not null default '',
  creative_direction text not null default '',
  default_template   text not null default 'premium_quote_dark'
                     check (default_template in ('premium_quote_dark', 'vintage_editorial', 'educational_infographic')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_used_at       timestamptz
);

-- Prompt names are unique regardless of case and surrounding spaces
-- ("Psychology Self Worth" and " psychology self worth" are the same prompt).
-- The app checks this before saving; the index also blocks two saves racing each other.
create unique index if not exists saved_prompts_name_unique_idx
  on public.saved_prompts (lower(btrim(name)));

-- updated_at is set by the app when a prompt's content changes. It is deliberately
-- not a trigger: selecting a prompt only sets last_used_at.

-- Row Level Security: on, with no public policies. The server should use
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. Nobody holding only the public
-- anon key can read or change prompts.
alter table public.saved_prompts enable row level security;

-- OPTIONAL, only if you must run the server with SUPABASE_ANON_KEY instead of the
-- service role key. Warning: the anon key is public by design, so these policies let
-- anyone who has your project URL and anon key read and edit every saved prompt.
-- create policy "anon read prompts"   on public.saved_prompts for select to anon using (true);
-- create policy "anon insert prompts" on public.saved_prompts for insert to anon with check (true);
-- create policy "anon update prompts" on public.saved_prompts for update to anon using (true) with check (true);
-- create policy "anon delete prompts" on public.saved_prompts for delete to anon using (true);
