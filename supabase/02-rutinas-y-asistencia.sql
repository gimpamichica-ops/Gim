-- Pegar en Supabase > SQL Editor > Run (una sola vez). No borra nada.
alter table public.ajustes add column if not exists rutinas jsonb not null default '[]'; -- [{"id","nombre":"Día 1","ejercicios":["Barbell_Squat",...]}]

create table if not exists public.dias (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fecha date not null,
  fue boolean not null default true,  -- fui / no fui al gimnasio
  rutina text,                        -- id del día de rutina que hizo (ajustes.rutinas[].id)
  comentario text,
  primary key (user_id, fecha)
);
alter table public.dias enable row level security;
create policy "solo lo mio" on public.dias for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
