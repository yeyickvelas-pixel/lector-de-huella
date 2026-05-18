-- =====================================================================
-- AsistApp - Esquema inicial
-- Pegar TODO este archivo en Supabase: SQL Editor -> New query -> Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabla: empleados (1 fila por usuario de auth)
-- ---------------------------------------------------------------------
create table if not exists public.empleados (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique not null references auth.users(id) on delete cascade,
  nombre        text not null,
  email         text not null,
  credential_id text,
  public_key    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tabla: registros (entrada/salida)
-- client_id permite deduplicar al sincronizar desde offline
-- ---------------------------------------------------------------------
create table if not exists public.registros (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  tipo         text not null check (tipo in ('entrada','salida')),
  fecha_hora   timestamptz not null default now(),
  lat          double precision,
  lng          double precision,
  client_id    text,
  created_at   timestamptz not null default now()
);

create index if not exists registros_empleado_fecha_idx
  on public.registros (empleado_id, fecha_hora desc);

create unique index if not exists registros_client_id_uniq
  on public.registros (empleado_id, client_id)
  where client_id is not null;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.empleados enable row level security;
alter table public.registros enable row level security;

drop policy if exists "empleados_select_own"  on public.empleados;
drop policy if exists "empleados_insert_own"  on public.empleados;
drop policy if exists "empleados_update_own"  on public.empleados;

create policy "empleados_select_own"
  on public.empleados for select
  using (auth.uid() = user_id);

create policy "empleados_insert_own"
  on public.empleados for insert
  with check (auth.uid() = user_id);

create policy "empleados_update_own"
  on public.empleados for update
  using (auth.uid() = user_id);

drop policy if exists "registros_select_own"  on public.registros;
drop policy if exists "registros_insert_own"  on public.registros;

create policy "registros_select_own"
  on public.registros for select
  using (exists (
    select 1 from public.empleados e
    where e.id = registros.empleado_id and e.user_id = auth.uid()
  ));

create policy "registros_insert_own"
  on public.registros for insert
  with check (exists (
    select 1 from public.empleados e
    where e.id = registros.empleado_id and e.user_id = auth.uid()
  ));
