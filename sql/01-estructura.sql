
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
-- ======================================================================
--  PERMISOS DEL APOYO DE ALMACÉN — versión del 01/10/2026
--  JVC Consultores y Ejecutores E.I.R.L. · C.P. San Francisco
--
--  QUÉ HACE
--    Al apoyo se le abrieron más pantallas en el sistema (salidas,
--    préstamos, horómetro, conteo, inventario y catálogo). Para que lo
--    que carga ahí llegue de verdad a la nube, hay que abrirle también
--    las reglas de seguridad. Si no se corre este archivo, el apoyo va a
--    poder registrar en pantalla pero arriba va a decir «falta subir» y
--    nadie más va a ver lo que cargó.
--
--  CÓMO SE USA
--    Supabase → SQL Editor → New query → pegar todo → RUN.
--    Se puede correr las veces que haga falta.
--
--  QUÉ SIGUE PROHIBIDO PARA EL APOYO
--    · los requerimientos (los pide la obra, no el almacén)
--    · tocar días de hace más de dos meses: un mes cerrado y firmado no
--      se vuelve a abrir desde el celular del apoyo
--    · borrar renglones: los errores se anulan desde el sistema, que deja
--      rastro de quién y cuándo
-- ======================================================================

-- ---- almacen ----
-- Se le suman PERSONAL (al despachar escribe el nombre de quien se lleva
-- las cosas, y si es alguien nuevo el sistema lo crea) y CONTEOS (el
-- inventario físico). Requerimientos y maquinaria siguen fuera.
drop policy if exists "el apoyo escribe lo justo" on public.almacen;
create policy "el apoyo escribe lo justo" on public.almacen
  for insert to authenticated
  with check (clave in ('catalogo','listas','meta','personal','conteos'));

drop policy if exists "el apoyo actualiza lo justo" on public.almacen;
create policy "el apoyo actualiza lo justo" on public.almacen
  for update to authenticated
  using      (clave in ('catalogo','listas','meta','personal','conteos'))
  with check (clave in ('catalogo','listas','meta','personal','conteos'));

-- ---- dias ----
-- La ventana pasa de 7 días a 60: el conteo físico y las notas atrasadas
-- no entran en una semana. Más atrás de eso, lo carga el administrador.
drop policy if exists "el apoyo carga la semana" on public.dias;
drop policy if exists "el apoyo carga lo reciente" on public.dias;
create policy "el apoyo carga lo reciente" on public.dias
  for insert to authenticated
  with check (fecha between (current_date - interval '60 days') and (current_date + interval '1 day'));

drop policy if exists "el apoyo corrige la semana" on public.dias;
drop policy if exists "el apoyo corrige lo reciente" on public.dias;
create policy "el apoyo corrige lo reciente" on public.dias
  for update to authenticated
  using      (fecha between (current_date - interval '60 days') and (current_date + interval '1 day'))
  with check (fecha between (current_date - interval '60 days') and (current_date + interval '1 day'));

-- ---- comprobación ----
-- Después de RUN, abajo tienen que salir estas cuatro reglas del apoyo.
select policyname, cmd
from pg_policies
where schemaname = 'public' and policyname like 'el apoyo%'
order by tablename, policyname;