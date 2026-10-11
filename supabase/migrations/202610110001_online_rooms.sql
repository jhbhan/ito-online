create extension if not exists pgcrypto;

create table public.ito_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_player_id uuid,
  status text not null default 'lobby' check (status in ('lobby','entry','sorting','revealing','results')),
  prompt_text text not null default 'How scary is this animal?' check (char_length(prompt_text) between 1 and 120),
  low_label text not null default 'Not scary at all' check (char_length(low_label) between 1 and 80),
  high_label text not null default 'Absolutely terrifying' check (char_length(high_label) between 1 and 80),
  cards_per_player integer not null default 1 check (cards_per_player between 1 and 5),
  active_round_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table public.ito_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.ito_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  active boolean not null default true,
  joined_at timestamptz not null default now()
);
create unique index ito_players_active_name_idx on public.ito_players(room_id, lower(name)) where active;
alter table public.ito_rooms add constraint ito_rooms_host_player_id_fkey foreign key (host_player_id) references public.ito_players(id);

create table public.ito_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.ito_rooms(id) on delete cascade,
  phase text not null default 'entry' check (phase in ('entry','sorting','revealing','results')),
  locked_order uuid[],
  reveal_index integer not null default 0 check (reveal_index >= 0),
  created_at timestamptz not null default now()
);
alter table public.ito_rooms add constraint ito_rooms_active_round_id_fkey foreign key (active_round_id) references public.ito_rounds(id) on delete set null;

create table public.ito_cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.ito_rooms(id) on delete cascade,
  round_id uuid not null references public.ito_rounds(id) on delete cascade,
  owner_player_id uuid not null references public.ito_players(id),
  slot integer not null check (slot between 1 and 5),
  clue text not null default '' check (char_length(clue) <= 80),
  position integer not null,
  unique (round_id, owner_player_id, slot),
  unique (round_id, position)
);
create index ito_cards_room_round_idx on public.ito_cards(room_id, round_id);

create table public.ito_card_secrets (
  card_id uuid primary key references public.ito_cards(id) on delete cascade,
  round_id uuid not null references public.ito_rounds(id) on delete cascade,
  value integer not null check (value between 0 and 100),
  unique (round_id, value)
);

create table public.ito_join_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);
create index ito_join_attempts_ip_time_idx on public.ito_join_attempts(ip_hash, attempted_at desc);

alter table public.ito_rooms enable row level security;
alter table public.ito_players enable row level security;
alter table public.ito_rounds enable row level security;
alter table public.ito_cards enable row level security;
alter table public.ito_card_secrets enable row level security;
alter table public.ito_join_attempts enable row level security;
revoke all on public.ito_rooms, public.ito_players, public.ito_rounds, public.ito_cards, public.ito_card_secrets, public.ito_join_attempts from anon, authenticated;
grant all on public.ito_rooms, public.ito_players, public.ito_rounds, public.ito_cards, public.ito_card_secrets, public.ito_join_attempts to service_role;
grant usage, select on sequence public.ito_join_attempts_id_seq to service_role;

create or replace function public.ito_start_round(p_room_id uuid, p_host_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_room public.ito_rooms%rowtype;
  v_round_id uuid;
  v_values integer[];
  v_index integer := 0;
  v_card_id uuid;
  v_player record;
  v_slot integer;
  v_count integer;
begin
  select * into v_room from public.ito_rooms where id = p_room_id for update;
  if not found or v_room.host_player_id <> p_host_id or v_room.status <> 'lobby' or v_room.expires_at < now() then
    raise exception 'Room is not ready for a round';
  end if;
  select count(*) into v_count from public.ito_players where room_id = p_room_id and active;
  if v_count < 2 or v_count > 10 then raise exception 'A round needs 2 to 10 players'; end if;
  select array_agg(value order by random()) into v_values from generate_series(0,100) as numbers(value);
  insert into public.ito_rounds(room_id) values (p_room_id) returning id into v_round_id;
  for v_player in select id from public.ito_players where room_id = p_room_id and active order by joined_at, id loop
    for v_slot in 1..v_room.cards_per_player loop
      v_index := v_index + 1;
      insert into public.ito_cards(room_id, round_id, owner_player_id, slot, position)
      values (p_room_id, v_round_id, v_player.id, v_slot, v_index) returning id into v_card_id;
      insert into public.ito_card_secrets(card_id, round_id, value) values (v_card_id, v_round_id, v_values[v_index]);
    end loop;
  end loop;
  update public.ito_rooms set status = 'entry', active_round_id = v_round_id, updated_at = now(), expires_at = now() + interval '24 hours' where id = p_room_id;
  return v_round_id;
end;
$$;

create or replace function public.ito_advance(p_room_id uuid, p_host_id uuid, p_action text, p_order uuid[] default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.ito_rooms%rowtype;
  v_round public.ito_rounds%rowtype;
  v_count integer;
begin
  select * into v_room from public.ito_rooms where id = p_room_id for update;
  if not found or v_room.host_player_id <> p_host_id or v_room.expires_at < now() then raise exception 'Host access required'; end if;
  select * into v_round from public.ito_rounds where id = v_room.active_round_id for update;
  if p_action = 'sorting' and v_room.status = 'entry' then
    if exists (select 1 from public.ito_cards where round_id = v_round.id and btrim(clue) = '') then raise exception 'All clues must be submitted'; end if;
    update public.ito_rounds set phase = 'sorting' where id = v_round.id;
    update public.ito_rooms set status = 'sorting', updated_at = now() where id = p_room_id;
  elsif p_action in ('reorder','lock') and v_room.status = 'sorting' then
    if p_action = 'lock' and exists (select 1 from public.ito_cards where round_id = v_round.id and btrim(clue) = '') then
      raise exception 'All clues must be submitted before reveal';
    end if;
    select count(*) into v_count from public.ito_cards where round_id = v_round.id;
    if p_order is null or cardinality(p_order) <> v_count or
       (select count(distinct card_id) from unnest(p_order) as listed(card_id)) <> v_count or
       exists (select 1 from unnest(p_order) as listed(card_id) where not exists (select 1 from public.ito_cards c where c.id = listed.card_id and c.round_id = v_round.id))
    then raise exception 'Order must contain every card exactly once'; end if;
    -- Offset positions to preserve the unique (round_id, position) constraint during reorder.
    update public.ito_cards set position = position + 100 where round_id = v_round.id;
    update public.ito_cards c set position = positions.ordinality
    from unnest(p_order) with ordinality as positions(id, ordinality)
    where c.id = positions.id and c.round_id = v_round.id;
    if p_action = 'lock' then
      update public.ito_rounds set phase = 'revealing', locked_order = p_order, reveal_index = 0 where id = v_round.id;
      update public.ito_rooms set status = 'revealing', updated_at = now() where id = p_room_id;
    else
      update public.ito_rooms set updated_at = now() where id = p_room_id;
    end if;
  elsif p_action = 'reveal' and v_room.status = 'revealing' then
    select count(*) into v_count from public.ito_cards where round_id = v_round.id;
    if v_round.reveal_index >= v_count then raise exception 'All cards are already revealed'; end if;
    update public.ito_rounds set reveal_index = reveal_index + 1,
      phase = case when reveal_index + 1 = v_count then 'results' else 'revealing' end
    where id = v_round.id;
    update public.ito_rooms set status = case when v_round.reveal_index + 1 = v_count then 'results' else 'revealing' end,
      updated_at = now() where id = p_room_id;
  elsif p_action = 'next' and v_room.status = 'results' then
    update public.ito_rooms set status = 'lobby', active_round_id = null, updated_at = now() where id = p_room_id;
  else
    raise exception 'Action is unavailable in this phase';
  end if;
  update public.ito_rooms set expires_at = now() + interval '24 hours' where id = p_room_id;
end;
$$;

create or replace function public.ito_join_room(p_code text, p_name text, p_token_hash text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_room public.ito_rooms%rowtype;
  v_count integer;
begin
  select * into v_room from public.ito_rooms where code = p_code for update;
  if not found or v_room.status <> 'lobby' or v_room.expires_at < now() then raise exception 'This room is not accepting players'; end if;
  select count(*) into v_count from public.ito_players where room_id = v_room.id and active;
  if v_count >= 10 then raise exception 'This room is full'; end if;
  if exists (select 1 from public.ito_players where room_id = v_room.id and lower(name) = lower(p_name) and active) then
    raise exception 'That name is already taken in this room';
  end if;
  insert into public.ito_players(room_id, name, token_hash) values (v_room.id, p_name, p_token_hash);
  update public.ito_rooms set updated_at = now(), expires_at = now() + interval '24 hours' where id = v_room.id;
  return v_room.id;
end;
$$;

create or replace function public.ito_save_clue(p_room_id uuid, p_player_id uuid, p_card_id uuid, p_clue text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.ito_rooms%rowtype;
begin
  select * into v_room from public.ito_rooms where id = p_room_id for update;
  if not found or v_room.status not in ('entry','sorting') then raise exception 'Clues are locked now'; end if;
  if p_clue is null or char_length(btrim(p_clue)) not between 1 and 80 then raise exception 'Clue must be 1–80 characters'; end if;
  update public.ito_cards set clue = btrim(p_clue)
  where id = p_card_id and room_id = p_room_id and round_id = v_room.active_round_id and owner_player_id = p_player_id;
  if not found then raise exception 'This card does not belong to you'; end if;
  update public.ito_rooms set updated_at = now(), expires_at = now() + interval '24 hours' where id = p_room_id;
end;
$$;

revoke all on function public.ito_start_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ito_advance(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.ito_join_room(text, text, text) from public, anon, authenticated;
revoke all on function public.ito_save_clue(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ito_start_round(uuid, uuid) to service_role;
grant execute on function public.ito_advance(uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.ito_join_room(text, text, text) to service_role;
grant execute on function public.ito_save_clue(uuid, uuid, uuid, text) to service_role;
