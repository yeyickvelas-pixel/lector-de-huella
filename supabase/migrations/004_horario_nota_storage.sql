-- =====================================================================
-- Migración 004: horario por empleado + nota en registros + storage fotos
-- =====================================================================

-- Empleados: horario esperado
alter table public.empleados
  add column if not exists hora_entrada time,
  add column if not exists hora_salida  time;

-- Registros: nota libre + url de la foto
alter table public.registros
  add column if not exists nota     text,
  add column if not exists foto_url text;

-- =====================================================================
-- Storage: bucket privado para fotos de asistencia
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('asistencia-fotos', 'asistencia-fotos', false)
on conflict (id) do nothing;

-- Limpieza policies viejas (idempotente)
drop policy if exists "fotos_admin_insert"     on storage.objects;
drop policy if exists "fotos_admin_select"     on storage.objects;
drop policy if exists "fotos_admin_update"     on storage.objects;
drop policy if exists "fotos_admin_delete"     on storage.objects;
drop policy if exists "fotos_super_admin_all"  on storage.objects;

-- Path estándar: {admin_id}/{client_id}.jpg
-- (storage.foldername(name))[1] = admin uuid
create policy "fotos_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asistencia-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "fotos_admin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'asistencia-fotos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_super_admin()
    )
  );

create policy "fotos_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'asistencia-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "fotos_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'asistencia-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- Registros: agregar policies de UPDATE y DELETE para admin
-- =====================================================================
drop policy if exists "registros_admin_update" on public.registros;
drop policy if exists "registros_admin_delete" on public.registros;

create policy "registros_admin_update"
  on public.registros for update to authenticated
  using (
    exists (select 1 from public.empleados e where e.id = registros.empleado_id and (e.admin_id = auth.uid() or public.is_super_admin()))
  )
  with check (
    exists (select 1 from public.empleados e where e.id = registros.empleado_id and (e.admin_id = auth.uid() or public.is_super_admin()))
  );

create policy "registros_admin_delete"
  on public.registros for delete to authenticated
  using (
    exists (select 1 from public.empleados e where e.id = registros.empleado_id and (e.admin_id = auth.uid() or public.is_super_admin()))
  );
