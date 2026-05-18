-- =====================================================================
-- Migración 003: Reconocimiento facial + ubicación oficina
-- Pegar en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- 1) Empleados: descriptores faciales (array de arrays de 128 floats)
alter table public.empleados
  add column if not exists face_descriptors jsonb not null default '[]'::jsonb,
  add column if not exists foto_url text;

-- 2) Profiles (admin): ubicación de su oficina + radio permitido
alter table public.profiles
  add column if not exists oficina_lat    double precision,
  add column if not exists oficina_lng    double precision,
  add column if not exists oficina_radio  integer default 150;  -- metros

-- 3) Permitir update del propio profile (para que el admin configure su oficina)
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
