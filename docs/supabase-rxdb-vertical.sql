-- RxDB vertical 1: mesas, comandas, comanda_items
-- Proyecto nuevo de Supabase

create extension if not exists moddatetime schema extensions;

-- MESAS
create table if not exists public.mesas (
  id text primary key,
  nombre text not null,
  estado text not null check (estado in ('libre', 'ocupada', 'cuenta')),
  piso text not null,
  capacidad numeric,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_mesas on public.mesas;
create trigger update_modified_mesas
before update on public.mesas
for each row
execute function extensions.moddatetime('_modified');

-- ORGANIZACIONES
create table if not exists public.organizaciones (
  id text primary key,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_organizaciones on public.organizaciones;
create trigger update_modified_organizaciones
before update on public.organizaciones
for each row
execute function extensions.moddatetime('_modified');

-- CATEGORIAS
create table if not exists public.categorias (
  id text primary key,
  nombre text not null,
  es_comida_incluida boolean,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_categorias on public.categorias;
create trigger update_modified_categorias
before update on public.categorias
for each row
execute function extensions.moddatetime('_modified');

-- CLIENTES
create table if not exists public.clientes (
  id text primary key,
  nombre text not null,
  telefono text,
  email text,
  direccion text,
  dni text,
  notas text,
  created_at timestamptz not null default now(),
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_clientes on public.clientes;
create trigger update_modified_clientes
before update on public.clientes
for each row
execute function extensions.moddatetime('_modified');

-- PISOS
create table if not exists public.pisos (
  id text primary key,
  nombre text not null,
  orden integer not null,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_pisos on public.pisos;
create trigger update_modified_pisos
before update on public.pisos
for each row
execute function extensions.moddatetime('_modified');

-- HABITACION CUENTAS
create table if not exists public.habitacion_cuentas (
  id text primary key,
  mesa_id text not null references public.mesas(id) on delete restrict,
  huesped text not null,
  cliente_id text,
  check_in date not null,
  check_out date,
  estado text not null check (estado in ('activa', 'cerrada')),
  notas text,
  organization_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_habitacion_cuentas on public.habitacion_cuentas;
create trigger update_modified_habitacion_cuentas
before update on public.habitacion_cuentas
for each row
execute function extensions.moddatetime('_modified');

-- RESERVAS
create table if not exists public.reservas (
  id text primary key,
  nombre text not null,
  fecha text not null,
  hora text not null,
  personas numeric not null,
  zona_id text,
  mesa_id text,
  comanda_id text,
  estado text not null check (estado in ('pendiente', 'confirmada', 'cancelada', 'completada')),
  nota text,
  abono numeric,
  telefono text,
  email text,
  organization_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_reservas on public.reservas;
create trigger update_modified_reservas
before update on public.reservas
for each row
execute function extensions.moddatetime('_modified');

-- MENU ITEMS
create table if not exists public.menu_items (
  id text primary key,
  nombre text not null,
  precio numeric not null,
  categoria_id text not null references public.categorias(id) on delete restrict,
  categoria_nombre text,
  activo boolean not null default true,
  modificadores jsonb not null default '[]'::jsonb,
  favorito boolean,
  descripcion text,
  imagen_url text,
  iva_modalidad text check (iva_modalidad in ('sistema', 'especifico', 'exento')),
  iva_porcentaje numeric,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_menu_items on public.menu_items;
create trigger update_modified_menu_items
before update on public.menu_items
for each row
execute function extensions.moddatetime('_modified');

-- AJUSTES IVA
create table if not exists public.ajustes_iva (
  id text primary key,
  porcentaje numeric not null,
  activo boolean not null default false,
  precios_con_iva boolean,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_ajustes_iva on public.ajustes_iva;
create trigger update_modified_ajustes_iva
before update on public.ajustes_iva
for each row
execute function extensions.moddatetime('_modified');

-- USUARIOS
create table if not exists public.usuarios (
  id text primary key,
  nombre text not null,
  pin text,
  rol text not null check (rol in ('admin', 'mesero', 'cajero')),
  email text,
  password text,
  organization_id text not null,
  activo boolean not null default true,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_usuarios on public.usuarios;
create trigger update_modified_usuarios
before update on public.usuarios
for each row
execute function extensions.moddatetime('_modified');

-- PAGOS
create table if not exists public.pagos (
  id text primary key,
  comanda_id text not null references public.comandas(id) on delete restrict,
  monto numeric not null,
  metodo_pago text not null check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia', 'otros')),
  fecha timestamptz not null,
  tipo_division text,
  factura_nro text,
  factura_nota text,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_pagos on public.pagos;
create trigger update_modified_pagos
before update on public.pagos
for each row
execute function extensions.moddatetime('_modified');

-- COMANDAS
create table if not exists public.comandas (
  id text primary key,
  folio numeric not null,
  mesa_id text not null references public.mesas(id) on delete restrict,
  mesa_nombre text,
  mesero text not null,
  cliente text,
  cliente_id text,
  estado text not null check (estado in ('pendiente', 'en_cocina', 'listo', 'cuenta', 'cerrado', 'facturado', 'anulada')),
  habitacion_cuenta_id text,
  nota text,
  factura_nro text,
  factura_nota text,
  confirmada boolean not null default false,
  total numeric not null default 0,
  personas numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  motivo_anulacion text,
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_comandas on public.comandas;
create trigger update_modified_comandas
before update on public.comandas
for each row
execute function extensions.moddatetime('_modified');

-- COMANDA ITEMS
create table if not exists public.comanda_items (
  id text primary key,
  comanda_id text not null references public.comandas(id) on delete restrict,
  item_id text not null,
  nombre text not null,
  precio numeric not null,
  cantidad numeric not null,
  modificadores text[] default '{}'::text[],
  nota text,
  estado text not null check (estado in ('pendiente', 'listo')),
  pagado_cantidad numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id text not null,
  _deleted boolean not null default false,
  _modified timestamptz not null default now()
);

drop trigger if exists update_modified_comanda_items on public.comanda_items;
create trigger update_modified_comanda_items
before update on public.comanda_items
for each row
execute function extensions.moddatetime('_modified');

-- Realtime
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesas'
  ) then alter publication supabase_realtime add table public.mesas; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organizaciones'
  ) then alter publication supabase_realtime add table public.organizaciones; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categorias'
  ) then alter publication supabase_realtime add table public.categorias; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clientes'
  ) then alter publication supabase_realtime add table public.clientes; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservas'
  ) then alter publication supabase_realtime add table public.reservas; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comandas'
  ) then alter publication supabase_realtime add table public.comandas; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comanda_items'
  ) then alter publication supabase_realtime add table public.comanda_items; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pisos'
  ) then alter publication supabase_realtime add table public.pisos; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'habitacion_cuentas'
  ) then alter publication supabase_realtime add table public.habitacion_cuentas; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pagos'
  ) then alter publication supabase_realtime add table public.pagos; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then alter publication supabase_realtime add table public.menu_items; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ajustes_iva'
  ) then alter publication supabase_realtime add table public.ajustes_iva; end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'usuarios'
  ) then alter publication supabase_realtime add table public.usuarios; end if;
end
$$;

-- RLS
alter table public.mesas enable row level security;
alter table public.organizaciones enable row level security;
alter table public.categorias enable row level security;
alter table public.clientes enable row level security;
alter table public.reservas enable row level security;
alter table public.comandas enable row level security;
alter table public.comanda_items enable row level security;
alter table public.pisos enable row level security;
alter table public.habitacion_cuentas enable row level security;
alter table public.pagos enable row level security;
alter table public.menu_items enable row level security;
alter table public.ajustes_iva enable row level security;
alter table public.usuarios enable row level security;

drop policy if exists "mesas select" on public.mesas;
drop policy if exists "mesas insert" on public.mesas;
drop policy if exists "mesas update" on public.mesas;
drop policy if exists "organizaciones select" on public.organizaciones;
drop policy if exists "organizaciones insert" on public.organizaciones;
drop policy if exists "organizaciones update" on public.organizaciones;
drop policy if exists "categorias select" on public.categorias;
drop policy if exists "categorias insert" on public.categorias;
drop policy if exists "categorias update" on public.categorias;
drop policy if exists "clientes select" on public.clientes;
drop policy if exists "clientes insert" on public.clientes;
drop policy if exists "clientes update" on public.clientes;
drop policy if exists "reservas select" on public.reservas;
drop policy if exists "reservas insert" on public.reservas;
drop policy if exists "reservas update" on public.reservas;
drop policy if exists "comandas select" on public.comandas;
drop policy if exists "comandas insert" on public.comandas;
drop policy if exists "comandas update" on public.comandas;
drop policy if exists "comanda_items select" on public.comanda_items;
drop policy if exists "comanda_items insert" on public.comanda_items;
drop policy if exists "comanda_items update" on public.comanda_items;
drop policy if exists "pisos select" on public.pisos;
drop policy if exists "pisos insert" on public.pisos;
drop policy if exists "pisos update" on public.pisos;
drop policy if exists "habitacion_cuentas select" on public.habitacion_cuentas;
drop policy if exists "habitacion_cuentas insert" on public.habitacion_cuentas;
drop policy if exists "habitacion_cuentas update" on public.habitacion_cuentas;
drop policy if exists "pagos select" on public.pagos;
drop policy if exists "pagos insert" on public.pagos;
drop policy if exists "pagos update" on public.pagos;
drop policy if exists "menu_items select" on public.menu_items;
drop policy if exists "menu_items insert" on public.menu_items;
drop policy if exists "menu_items update" on public.menu_items;
drop policy if exists "ajustes_iva select" on public.ajustes_iva;
drop policy if exists "ajustes_iva insert" on public.ajustes_iva;
drop policy if exists "ajustes_iva update" on public.ajustes_iva;
drop policy if exists "usuarios select" on public.usuarios;
drop policy if exists "usuarios insert" on public.usuarios;
drop policy if exists "usuarios update" on public.usuarios;

create policy "mesas select"
on public.mesas
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "mesas insert"
on public.mesas
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "mesas update"
on public.mesas
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "organizaciones select"
on public.organizaciones
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "organizaciones insert"
on public.organizaciones
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "organizaciones update"
on public.organizaciones
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "categorias select"
on public.categorias
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "categorias insert"
on public.categorias
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "categorias update"
on public.categorias
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "clientes select"
on public.clientes
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "clientes insert"
on public.clientes
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "clientes update"
on public.clientes
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "reservas select"
on public.reservas
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "reservas insert"
on public.reservas
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "reservas update"
on public.reservas
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comandas select"
on public.comandas
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comandas insert"
on public.comandas
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comandas update"
on public.comandas
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comanda_items select"
on public.comanda_items
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comanda_items insert"
on public.comanda_items
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "comanda_items update"
on public.comanda_items
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pisos select"
on public.pisos
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pisos insert"
on public.pisos
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pisos update"
on public.pisos
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "habitacion_cuentas select"
on public.habitacion_cuentas
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "habitacion_cuentas insert"
on public.habitacion_cuentas
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "habitacion_cuentas update"
on public.habitacion_cuentas
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pagos select"
on public.pagos
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pagos insert"
on public.pagos
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "pagos update"
on public.pagos
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "menu_items select"
on public.menu_items
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "menu_items insert"
on public.menu_items
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "menu_items update"
on public.menu_items
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "ajustes_iva select"
on public.ajustes_iva
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "ajustes_iva insert"
on public.ajustes_iva
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "ajustes_iva update"
on public.ajustes_iva
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "usuarios select"
on public.usuarios
for select
using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "usuarios insert"
on public.usuarios
for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "usuarios update"
on public.usuarios
for update
using (auth.role() = 'authenticated' or auth.role() = 'anon')
with check (auth.role() = 'authenticated' or auth.role() = 'anon');
