-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Characters
create table public.characters (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null default 'My Character',
  source_photo_url text not null,
  selected_style_url text,
  lora_version text,
  lora_training_status text check (lora_training_status in ('pending','processing','succeeded','failed','canceled')),
  created_at timestamptz default now()
);

alter table public.characters enable row level security;
create policy "Users manage own characters" on public.characters for all using (auth.uid() = user_id);

-- Character style options
create table public.character_options (
  id uuid default uuid_generate_v4() primary key,
  character_id uuid references public.characters(id) on delete cascade not null,
  style_url text not null,
  style_name text not null,
  created_at timestamptz default now()
);

alter table public.character_options enable row level security;
create policy "Users view own character options" on public.character_options for all
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

-- Voices
create table public.voices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  character_id uuid references public.characters(id) on delete cascade not null,
  sample_audio_url text,
  tts_params jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.voices enable row level security;
create policy "Users manage own voices" on public.voices for all using (auth.uid() = user_id);

-- Projects
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  character_id uuid references public.characters(id) on delete set null,
  voice_id uuid references public.voices(id) on delete set null,
  title text not null default 'Untitled Video',
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','canceled')),
  final_video_url text,
  created_at timestamptz default now()
);

alter table public.projects enable row level security;
create policy "Users manage own projects" on public.projects for all using (auth.uid() = user_id);

-- Scenes
create table public.scenes (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  order_index integer not null default 0,
  description text not null,
  image_url text,
  audio_url text,
  video_clip_url text,
  duration_seconds integer,
  created_at timestamptz default now()
);

alter table public.scenes enable row level security;
create policy "Users manage own scenes" on public.scenes for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- Jobs (tracks async Replicate predictions)
create table public.jobs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('cartoon_generation','lora_training','tts','video_clip','video_stitch')),
  replicate_prediction_id text,
  entity_id uuid not null,
  entity_type text not null check (entity_type in ('character','scene','project')),
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','canceled')),
  result jsonb,
  error text,
  created_at timestamptz default now()
);

alter table public.jobs enable row level security;
create policy "Users view own jobs" on public.jobs for all using (auth.uid() = user_id);

-- Storage buckets (run in Supabase dashboard or via CLI)
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);
insert into storage.buckets (id, name, public) values ('generated', 'generated', false);

create policy "Auth users upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('uploads', 'generated'));
create policy "Users read own files" on storage.objects for select to authenticated
  using (auth.uid()::text = (storage.foldername(name))[1]);
