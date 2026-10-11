alter table public.ito_rooms drop constraint ito_rooms_status_check;
alter table public.ito_rooms add constraint ito_rooms_status_check
  check (status in ('lobby', 'entry', 'sorting', 'revealing', 'results', 'closed'));

create or replace function public.ito_close_room(p_room_id uuid, p_host_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.ito_rooms%rowtype;
begin
  select * into v_room from public.ito_rooms where id = p_room_id for update;
  if not found or v_room.host_player_id <> p_host_id or v_room.expires_at < now() then
    raise exception 'Host access required';
  end if;
  if v_room.status = 'closed' then raise exception 'This room is already closed'; end if;

  -- Keep the room briefly so connected players can see that it was closed,
  -- but remove all round data and private numbers immediately.
  update public.ito_rooms
    set status = 'closed', active_round_id = null, updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = p_room_id;
  delete from public.ito_rounds where room_id = p_room_id;
end;
$$;

revoke all on function public.ito_close_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ito_close_room(uuid, uuid) to service_role;
