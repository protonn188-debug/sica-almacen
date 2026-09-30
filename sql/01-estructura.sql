
-- ----------------------------------------------------------------------
--  1 · QUIÉN ES CADA USUARIO
-- ----------------------------------------------------------------------
create table if not exists public.perfiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text not null default '',
  rol     text not null default 'apoyo' check (rol in ('admin','apoyo')),
  creado  timestamptz not null default now()
);

-- Cuando se crea un usuario en Supabase, aparece solo en perfiles como
-- apoyo. El administrador se marca a mano después (ver el paso 6 de la guía).
create or replace function public.nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)), 'apoyo')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- Atajo para preguntar "¿el que está entrando es administrador?"
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------
--  2 · LOS DATOS
--  El sistema guarda documentos completos en formato JSON. Así el kardex
--  sigue calculándose en el equipo (rápido, y funciona sin internet) y la
--  nube solo se encarga de que todos vean lo mismo.
-- ----------------------------------------------------------------------
create table if not exists public.almacen (
  clave       text primary key,          -- meta, catalogo, personal, listas…
  datos       jsonb not null,
  ts          bigint not null default 0, -- la marca de tiempo del sistema
  por         uuid references auth.users(id),
  actualizado timestamptz not null default now()
);

create table if not exists public.dias (
  fecha       date primary key,
  datos       jsonb not null,
  ts          bigint not null default 0,
  por         uuid references auth.users(id),
  actualizado timestamptz not null default now()
);

create index if not exists dias_por_fecha on public.dias (fecha desc);

-- La hora de la última escritura se pone sola
create or replace function public.marcar_hora()
returns trigger language plpgsql as $$
begin new.actualizado = now(); return new; end $$;

drop trigger if exists hora_almacen on public.almacen;
create trigger hora_almacen before insert or update on public.almacen
  for each row execute function public.marcar_hora();
drop trigger if exists hora_dias on public.dias;
create trigger hora_dias before insert or update on public.dias
  for each row execute function public.marcar_hora();

-- ----------------------------------------------------------------------
--  3 · LAS REGLAS DE SEGURIDAD
--  Esto es lo que de verdad protege los datos. Queda encendido para las
--  tres tablas: sin una regla que lo permita, nadie puede hacer nada.
-- ----------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.almacen  enable row level security;
alter table public.dias     enable row level security;

-- ---- perfiles ----
drop policy if exists "cada uno ve su perfil" on public.perfiles;
create policy "cada uno ve su perfil" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());

drop policy if exists "solo el admin cambia perfiles" on public.perfiles;
create policy "solo el admin cambia perfiles" on public.perfiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---- almacen ----
-- Todos los que entran necesitan leer: sin el catálogo no se puede
-- cargar una guía.
drop policy if exists "todos leen el almacen" on public.almacen;
create policy "todos leen el almacen" on public.almacen
  for select to authenticated using (true);

drop policy if exists "el admin escribe todo el almacen" on public.almacen;
create policy "el admin escribe todo el almacen" on public.almacen
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- El apoyo solo puede escribir las tres claves que necesita para cargar
-- una guía: el catálogo (crea artículos al vuelo), las listas
-- (proveedores y puntos de llegada) y meta (el correlativo del número
-- provisional). No puede tocar personal, conteos ni requerimientos.
drop policy if exists "el apoyo escribe lo justo" on public.almacen;
create policy "el apoyo escribe lo justo" on public.almacen
  for insert to authenticated
  with check (clave in ('catalogo','listas','meta'));

drop policy if exists "el apoyo actualiza lo justo" on public.almacen;
create policy "el apoyo actualiza lo justo" on public.almacen
  for update to authenticated
  using (clave in ('catalogo','listas','meta'))
  with check (clave in ('catalogo','listas','meta'));

-- ---- dias ----
drop policy if exists "todos leen los dias" on public.dias;
create policy "todos leen los dias" on public.dias
  for select to authenticated using (true);

drop policy if exists "el admin escribe todos los dias" on public.dias;
create policy "el admin escribe todos los dias" on public.dias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- El apoyo solo puede escribir días recientes: hoy y los 7 anteriores.
-- Así puede cargar el taco de guías de la semana, pero no puede volver
-- atrás a cambiar un mes ya cerrado y firmado.
drop policy if exists "el apoyo carga la semana" on public.dias;
create policy "el apoyo carga la semana" on public.dias
  for insert to authenticated
  with check (fecha between (current_date - interval '7 days') and (current_date + interval '1 day'));

drop policy if exists "el apoyo corrige la semana" on public.dias;
create policy "el apoyo corrige la semana" on public.dias
  for update to authenticated
  using  (fecha between (current_date - interval '7 days') and (current_date + interval '1 day'))
  with check (fecha between (current_date - interval '7 days') and (current_date + interval '1 day'));

-- Nadie borra días ni claves del almacén: los errores se anulan desde el
-- sistema, que deja rastro. El borrado de verdad queda solo para el admin
-- (lo cubre la política "el admin escribe todo…", que incluye delete).

-- ======================================================================
--  LISTO. Ahora ve al paso 6 de la guía para crear los dos usuarios y
--  marcarte a ti como administrador.
-- ======================================================================
