-- Fire Alarm Deficiency Manager database setup
-- Run the entire script in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  property_name text not null,
  address text,
  join_code text not null unique,
  status text not null default 'draft' check (status in ('draft','ready','closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.report_members (
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(report_id,user_id)
);

create table if not exists public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  device_type text not null,
  floor text not null,
  location text not null,
  part_number text not null,
  quantity integer not null check(quantity > 0),
  minutes_each numeric(8,2) not null default 30 check(minutes_each >= 0),
  extra_minutes numeric(8,2) not null default 0 check(extra_minutes >= 0),
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.deficiency_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  deficiency_id uuid not null references public.deficiencies(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists deficiencies_report_id_idx on public.deficiencies(report_id);
create index if not exists photos_deficiency_id_idx on public.deficiency_photos(deficiency_id);
create index if not exists members_user_id_idx on public.report_members(user_id);

create or replace function public.is_report_member(p_report uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.report_members where report_id=p_report and user_id=auth.uid()); $$;

create or replace function public.add_report_creator()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.report_members(report_id,user_id) values(new.id,new.created_by);
  return new;
end; $$;
drop trigger if exists report_creator_membership on public.reports;
create trigger report_creator_membership after insert on public.reports
for each row execute function public.add_report_creator();

-- Join by share code. Locks the report row so simultaneous joins cannot exceed 3.
create or replace function public.join_report_by_code(p_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare rid uuid; member_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into rid from public.reports where upper(join_code)=upper(trim(p_code)) for update;
  if rid is null then raise exception 'Report code not found'; end if;
  if exists(select 1 from public.report_members where report_id=rid and user_id=auth.uid()) then return rid; end if;
  select count(*) into member_count from public.report_members where report_id=rid;
  if member_count >= 3 then raise exception 'This report already has three technicians'; end if;
  insert into public.report_members(report_id,user_id) values(rid,auth.uid());
  return rid;
end; $$;

alter table public.reports enable row level security;
alter table public.report_members enable row level security;
alter table public.deficiencies enable row level security;
alter table public.deficiency_photos enable row level security;

drop policy if exists reports_select_members on public.reports;
create policy reports_select_members on public.reports for select to authenticated using(public.is_report_member(id));
drop policy if exists reports_insert_creator on public.reports;
create policy reports_insert_creator on public.reports for insert to authenticated with check(created_by=auth.uid());
drop policy if exists reports_update_members on public.reports;
create policy reports_update_members on public.reports for update to authenticated using(public.is_report_member(id)) with check(public.is_report_member(id));

drop policy if exists members_select_team on public.report_members;
create policy members_select_team on public.report_members for select to authenticated using(public.is_report_member(report_id));
-- Membership creation is performed by the report trigger and join RPC only.

drop policy if exists deficiencies_select_members on public.deficiencies;
create policy deficiencies_select_members on public.deficiencies for select to authenticated using(public.is_report_member(report_id));
drop policy if exists deficiencies_insert_members on public.deficiencies;
create policy deficiencies_insert_members on public.deficiencies for insert to authenticated with check(public.is_report_member(report_id) and created_by=auth.uid());
drop policy if exists deficiencies_update_members on public.deficiencies;
create policy deficiencies_update_members on public.deficiencies for update to authenticated using(public.is_report_member(report_id)) with check(public.is_report_member(report_id));
drop policy if exists deficiencies_delete_members on public.deficiencies;
create policy deficiencies_delete_members on public.deficiencies for delete to authenticated using(public.is_report_member(report_id));

drop policy if exists photos_select_members on public.deficiency_photos;
create policy photos_select_members on public.deficiency_photos for select to authenticated using(public.is_report_member(report_id));
drop policy if exists photos_insert_members on public.deficiency_photos;
create policy photos_insert_members on public.deficiency_photos for insert to authenticated with check(public.is_report_member(report_id) and uploaded_by=auth.uid());

-- Private storage bucket for device photos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('deficiency-photos','deficiency-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict(id) do nothing;

drop policy if exists deficiency_photo_upload on storage.objects;
create policy deficiency_photo_upload on storage.objects for insert to authenticated
with check(bucket_id='deficiency-photos' and public.is_report_member(((storage.foldername(name))[1])::uuid));
drop policy if exists deficiency_photo_read on storage.objects;
create policy deficiency_photo_read on storage.objects for select to authenticated
using(bucket_id='deficiency-photos' and public.is_report_member(((storage.foldername(name))[1])::uuid));
drop policy if exists deficiency_photo_delete on storage.objects;
create policy deficiency_photo_delete on storage.objects for delete to authenticated
using(bucket_id='deficiency-photos' and public.is_report_member(((storage.foldername(name))[1])::uuid));

-- Enable database change broadcasts for shared live updates.
do $$ begin
  alter publication supabase_realtime add table public.deficiencies;
exception when duplicate_object then null;
when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.report_members;
exception when duplicate_object then null;
when others then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.reports;
exception when duplicate_object then null;
when others then null;
end $$;
