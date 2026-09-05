-- Esquema "NosVemos" (coordinación de reuniones por disponibilidad)
-- Destructivo: borra las tablas existentes antes de recrearlas.
-- Aplicar con cuidado (la consola SQL de Supabase no pide confirmación).

drop table if exists public.slots;
drop table if exists public.participants;
drop table if exists public.meetings;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  timezone text not null default 'UTC',
  granularity_min int not null default 60,
  time_start_min int not null default 480,   -- rango horario visible (08:00)
  time_end_min int not null default 1200,    -- rango horario visible (20:00)
  agenda_type text not null default 'hybrid'
    check (agenda_type in ('weekly','one_off','hybrid')),
  creator_name text,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, name)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  kind text not null check (kind in ('weekly','one_off')),
  day_of_week int check (day_of_week between 0 and 6),   -- solo si kind='weekly'
  date text,                                              -- solo si kind='one_off'
  ranges jsonb not null                                   -- [[startMin,endMin], ...]
);

create index meetings_slug_idx   on public.meetings(slug);
create index participants_meeting_idx on public.participants(meeting_id);
create index slots_participant_idx on public.slots(participant_id);

-- RLS: MVP de link compartido → lectura/escritura anónima sobre la reunión.
alter table public.meetings     enable row level security;
alter table public.participants enable row level security;
alter table public.slots        enable row level security;

create policy "anon leer reunión"    on public.meetings     for select using (true);
create policy "anon crear reunión"   on public.meetings     for insert with check (true);
create policy "anon update reunión"  on public.meetings     for update using (true) with check (true);
create policy "anon leer participantes" on public.participants for select using (true);
create policy "anon insert participantes" on public.participants for insert with check (true);
create policy "anon leer slots"      on public.slots        for select using (true);
create policy "anon insert slots"    on public.slots        for insert with check (true);
create policy "anon delete slots"    on public.slots        for delete using (true);