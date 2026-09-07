-- Activa Realtime (Supabase) para las tablas de NosVemos.
-- Aditivo e idempotente: se puede correr sobre un esquema existente sin tocar
-- datos (schema.sql es destructivo y no se re-ejecuta sobre datos reales).
-- Correr en la consola SQL de Supabase (rol postgres).
-- Compatible con Postgres < 15 ("create publication if not exists" no existe).

-- Publicación estándar de Supabase (pestaña Database → Replication). En un
-- proyecto nuevo ya existe; se crea acá solo si faltara.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;

-- Alta idempotente de las tablas: "drop table" las saca solo de la
-- publicación, por eso re-chequeamos antes de cada alta.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['meetings', 'participants', 'slots']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;