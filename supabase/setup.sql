create table if not exists public.user_dashboard_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.user_dashboard_state enable row level security;

create policy "Users can read their own dashboard state"
on public.user_dashboard_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own dashboard state"
on public.user_dashboard_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own dashboard state"
on public.user_dashboard_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
