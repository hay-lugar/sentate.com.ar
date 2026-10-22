-- Estructura de seguridad: RLS en todas las tablas, grants mínimos, funciones privilegiadas acotadas.
begin;
select plan(14);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS habilitado en todas las tablas de public y private');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'),
  0, 'no hay vistas en public (ninguna puede saltear RLS)');

select ok(not has_table_privilege('anon', 'public.reservations', 'SELECT'), 'anon sin SELECT en reservations');
select ok(not has_table_privilege('anon', 'public.reservations', 'INSERT'), 'anon sin INSERT en reservations');
select ok(not has_table_privilege('anon', 'public.tenant_members', 'SELECT'), 'anon sin SELECT en tenant_members');
select ok(not has_table_privilege('anon', 'public.tenant_subscriptions', 'SELECT'), 'anon sin SELECT en suscripciones');
select ok(not has_table_privilege('authenticated', 'public.tenant_subscriptions', 'UPDATE'), 'authenticated sin UPDATE en suscripciones');
select ok(not has_table_privilege('authenticated', 'public.tenant_members', 'INSERT'), 'authenticated sin INSERT en membresías');
select ok(not has_column_privilege('authenticated', 'public.tenants', 'status', 'UPDATE'), 'el dueño no puede cambiar tenants.status');
select ok(not has_column_privilege('authenticated', 'public.reservations', 'tenant_id', 'UPDATE'), 'nadie mueve reservas a otro tenant');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  0, 'ninguna función SECURITY DEFINER en el esquema expuesto');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'toda función SECURITY DEFINER fija search_path vacío');

select ok(not has_function_privilege('anon', 'public.create_tenant(text,text,text)', 'EXECUTE'), 'anon no puede dar de alta comercios');
select ok(has_function_privilege('anon', 'public.request_reservation(uuid,date,time,integer,text,text,text,uuid,text,boolean)', 'EXECUTE'),
  'anon puede solicitar reservas solo por la función controlada');

select * from finish();
rollback;
