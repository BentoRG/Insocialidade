-- Insocialidade — schema Supabase
-- Execute no SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Tabela de perfis vinculada ao Supabase Auth
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  character_color text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now()
);

-- Índice para busca por username no login/cadastro
create index if not exists profiles_username_idx on public.profiles (username);

-- Trigger: cria perfil automaticamente no cadastro (não depende de sessão client-side)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, character_color, status)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data->>'username')),
    new.raw_user_meta_data->>'character_color',
    'pending'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: usuários autenticados leem apenas o próprio perfil
alter table public.profiles enable row level security;

create policy "Usuário lê o próprio perfil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Inserção feita pelo trigger security definer — policy de INSERT não é necessária

-- Trigger opcional: garante username em lowercase
create or replace function public.normalize_username()
returns trigger as $$
begin
  new.username := lower(trim(new.username));
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
  before insert or update on public.profiles
  for each row execute function public.normalize_username();
