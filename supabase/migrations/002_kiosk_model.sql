-- =====================================================================
-- Migración 002: Modelo kiosko multi-tenant
--   super_admin (yeyickvelas@gmail.com) → ve TODO
--   admin       → gestiona sus propios empleados
--   empleado    → sin cuenta, se identifica con huella
-- Pegar en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- 0) Limpia datos de prueba
delete from public.registros;
delete from public.empleados;

-- =====================================================================
-- 1) profiles: 1 fila por cada usuario de auth, con rol
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text,
  role        text not null default 'admin' check (role in ('super_admin','admin')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists profiles_email_idx on public.profiles (email);

-- Trigger: crea profile automáticamente cuando se crea un auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    case when new.email = 'yeyickvelas@gmail.com' then 'super_admin' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: crear profiles para usuarios ya existentes
insert into public.profiles (id, email, nombre, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'nombre', u.email),
  case when u.email = 'yeyickvelas@gmail.com' then 'super_admin' else 'admin' end
from auth.users u
on conflict (id) do nothing;

-- =====================================================================
-- 2) empleados: ahora pertenecen a un admin (no a auth.users directo)
-- =====================================================================
alter table public.empleados
  drop constraint if exists empleados_user_id_fkey,
  drop constraint if exists empleados_user_id_key;
alter table public.empleados drop column if exists user_id;

alter table public.empleados alter column email drop not null;

alter table public.empleados
  add column if not exists admin_id    uuid references public.profiles(id) on delete cascade,
  add column if not exists puesto      text,
  add column if not exists sign_count  bigint not null default 0,
  add column if not exists enrolled_at timestamptz;

alter table public.empleados alter column admin_id set not null;

create unique index if not exists empleados_credential_id_uniq
  on public.empleados (credential_id)
  where credential_id is not null;

-- =====================================================================
-- 3) Helper: ¿soy super admin? (vía JWT, sin recursión)
-- =====================================================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'yeyickvelas@gmail.com', false);
$$;

-- =====================================================================
-- 4) RLS — profiles
-- =====================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read"          on public.profiles;
drop policy if exists "profiles_super_admin_read"   on public.profiles;
drop policy if exists "profiles_super_admin_update" on public.profiles;
drop policy if exists "profiles_super_admin_delete" on public.profiles;

create policy "profiles_self_read"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_super_admin_read"
  on public.profiles for select
  to authenticated
  using (public.is_super_admin());

create policy "profiles_super_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "profiles_super_admin_delete"
  on public.profiles for delete
  to authenticated
  using (public.is_super_admin());

-- =====================================================================
-- 5) RLS — empleados
-- =====================================================================
drop policy if exists "empleados_select_own"        on public.empleados;
drop policy if exists "empleados_insert_own"        on public.empleados;
drop policy if exists "empleados_update_own"        on public.empleados;
drop policy if exists "super_admin_full_empleados"  on public.empleados;
drop policy if exists "empleados_admin_select"      on public.empleados;
drop policy if exists "empleados_admin_insert"      on public.empleados;
drop policy if exists "empleados_admin_update"      on public.empleados;
drop policy if exists "empleados_admin_delete"      on public.empleados;

create policy "empleados_admin_select"
  on public.empleados for select to authenticated
  using (admin_id = auth.uid() or public.is_super_admin());

create policy "empleados_admin_insert"
  on public.empleados for insert to authenticated
  with check (admin_id = auth.uid() or public.is_super_admin());

create policy "empleados_admin_update"
  on public.empleados for update to authenticated
  using (admin_id = auth.uid() or public.is_super_admin())
  with check (admin_id = auth.uid() or public.is_super_admin());

create policy "empleados_admin_delete"
  on public.empleados for delete to authenticated
  using (admin_id = auth.uid() or public.is_super_admin());

-- =====================================================================
-- 6) RLS — registros
-- =====================================================================
drop policy if exists "registros_select_own"        on public.registros;
drop policy if exists "registros_insert_own"        on public.registros;
drop policy if exists "super_admin_full_registros"  on public.registros;
drop policy if exists "registros_admin_select"      on public.registros;
drop policy if exists "registros_admin_insert"      on public.registros;

create policy "registros_admin_select"
  on public.registros for select to authenticated
  using (
    exists (
      select 1 from public.empleados e
      where e.id = registros.empleado_id
        and (e.admin_id = auth.uid() or public.is_super_admin())
    )
  );

create policy "registros_admin_insert"
  on public.registros for insert to authenticated
  with check (
    exists (
      select 1 from public.empleados e
      where e.id = registros.empleado_id
        and (e.admin_id = auth.uid() or public.is_super_admin())
    )
  );
