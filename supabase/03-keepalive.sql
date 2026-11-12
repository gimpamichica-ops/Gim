-- Keepalive: GitHub Actions llama a esta función a diario para que el plan gratis no pause el proyecto.
-- No lee ni escribe datos de nadie; solo devuelve la hora.
create or replace function public.keepalive() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
