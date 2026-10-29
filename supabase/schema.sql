-- Pegar en Supabase > SQL Editor > Run. Cada usuario ve y edita solo lo suyo (RLS).
create table if not exists public.registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fecha date not null default current_date,
  ejercicio text not null,
  series jsonb not null default '[]', -- fuerza: [{"kg":40,"reps":10}] · cardio: [{"min":20,"km":3}]
  implemento text, -- barra, mancuerna, máquina, polea, peso corporal (opcional)
  nota text,
  creado timestamptz not null default now()
);
alter table public.registros add column if not exists implemento text;
create index if not exists registros_user_fecha on public.registros (user_id, fecha);

create table if not exists public.ajustes (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  nombres jsonb not null default '{}', -- {"Barbell_Squat":"Sentadilla"}
  propios jsonb not null default '[]'  -- ejercicios agregados: [{"id","nombre","grupo"}]
);

alter table public.registros enable row level security;
alter table public.ajustes enable row level security;
drop policy if exists "solo lo mio" on public.registros;
drop policy if exists "solo lo mio" on public.ajustes;
create policy "solo lo mio" on public.registros for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "solo lo mio" on public.ajustes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
