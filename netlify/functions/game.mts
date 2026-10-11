import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Action = 'create' | 'join' | 'snapshot' | 'settings' | 'start' | 'clue' | 'sorting' | 'reorder' | 'lock' | 'reveal' | 'next' | 'leave';
type Payload = {
  action?: Action; roomId?: string; code?: string; name?: string; token?: string;
  promptText?: string; lowLabel?: string; highLabel?: string; cardsPerPlayer?: number;
  cardId?: string; clue?: string; order?: string[];
};
type Room = {
  id: string; code: string; host_player_id: string; status: string; prompt_text: string;
  low_label: string; high_label: string; cards_per_player: number; active_round_id: string | null; expires_at: string;
};
type Player = { id: string; room_id: string; name: string; token_hash: string; active: boolean; joined_at: string };
type Card = { id: string; room_id: string; round_id: string; owner_player_id: string; slot: number; clue: string; position: number };
type Round = { id: string; room_id: string; phase: string; locked_order: string[] | null; reveal_index: number };
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const checked = <T,>(data: T | null, error: { message: string } | null): T => {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('The requested game record was not found.');
  return data;
};

async function snapshot(db: SupabaseClient, room: Room, member: Player) {
  const playerResponse = await db.from('ito_players').select('id,name,active,joined_at').eq('room_id', room.id).order('joined_at');
  const players = checked(playerResponse.data, playerResponse.error);
  if (!room.active_round_id) return {
    room: publicRoom(room), me: { id: member.id, name: member.name, isHost: room.host_player_id === member.id },
    players, round: null,
  };
  const roundResponse = await db.from('ito_rounds').select('id,room_id,phase,locked_order,reveal_index').eq('id', room.active_round_id).single();
  const round = checked(roundResponse.data as Round | null, roundResponse.error);
  const cardResponse = await db.from('ito_cards').select('id,room_id,round_id,owner_player_id,slot,clue,position').eq('round_id', round.id).order('position');
  const cards = checked(cardResponse.data as Card[] | null, cardResponse.error);
  const ownedIds = cards.filter((card) => card.owner_player_id === member.id).map((card) => card.id);
  const revealedIds = round.locked_order?.slice(0, round.reveal_index) ?? [];
  const visibleIds = [...new Set([...ownedIds, ...revealedIds])];
  const values: Record<string, number> = {};
  if (visibleIds.length) {
    const secretResponse = await db.from('ito_card_secrets').select('card_id,value').in('card_id', visibleIds);
    for (const item of checked(secretResponse.data, secretResponse.error)) values[item.card_id] = item.value;
  }
  const showAllClues = round.phase !== 'entry';
  return {
    room: publicRoom(room), me: { id: member.id, name: member.name, isHost: room.host_player_id === member.id },
    players,
    round: {
      id: round.id, phase: round.phase, lockedOrder: round.locked_order, revealIndex: round.reveal_index,
      cards: cards.map((card) => ({
        id: card.id, ownerId: card.owner_player_id, slot: card.slot, position: card.position,
        submitted: !!card.clue.trim(), clue: showAllClues || card.owner_player_id === member.id ? card.clue : '',
        value: values[card.id] ?? null,
      })),
    },
  };
}
function publicRoom(room: Room) {
  return { id: room.id, code: room.code, hostPlayerId: room.host_player_id, status: room.status, promptText: room.prompt_text,
    lowLabel: room.low_label, highLabel: room.high_label, cardsPerPlayer: room.cards_per_player,
    expiresAt: room.expires_at };
}
async function getMember(db: SupabaseClient, payload: Payload) {
  const token = text(payload.token, 100);
  if (!isUuid(payload.roomId) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('This session is no longer valid.');
  const memberResponse = await db.from('ito_players').select('*').eq('room_id', payload.roomId).eq('token_hash', digest(token)).eq('active', true).maybeSingle();
  const member = checked(memberResponse.data as Player | null, memberResponse.error);
  const roomResponse = await db.from('ito_rooms').select('*').eq('id', payload.roomId).single();
  const room = checked(roomResponse.data as Room | null, roomResponse.error);
  if (Date.parse(room.expires_at) < Date.now()) throw new Error('This room has expired.');
  return { member, room };
}
const hostOnly = (room: Room, member: Player) => {
  if (room.host_player_id !== member.id) throw new Error('Only the moderator can do that.');
};
async function advance(db: SupabaseClient, room: Room, member: Player, action: string, order?: string[]) {
  hostOnly(room, member);
  const result = await db.rpc('ito_advance', { p_room_id: room.id, p_host_id: member.id, p_action: action, p_order: order ?? null });
  if (result.error) throw new Error(result.error.message);
}

export default async (request: Request) => {
  if (request.method !== 'POST') return fail('Use POST.', 405);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return fail('Online game is not configured on this server.', 503);
  let payload: Payload;
  try { payload = await request.json() as Payload; } catch { return fail('Invalid request body.'); }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (payload.action === 'create') {
      const name = text(payload.name, 24);
      if (!name) return fail('Enter your name.');
      const token = randomBytes(32).toString('hex');
      let room: Room | null = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
        const response = await db.from('ito_rooms').insert({ code }).select('*').single();
        if (!response.error) { room = response.data as Room; break; }
        if (response.error.code !== '23505') throw new Error(response.error.message);
      }
      if (!room) throw new Error('Could not find an available room code. Try again.');
      const playerResponse = await db.from('ito_players').insert({ room_id: room.id, name, token_hash: digest(token) }).select('*').single();
      const player = checked(playerResponse.data as Player | null, playerResponse.error);
      const update = await db.from('ito_rooms').update({ host_player_id: player.id }).eq('id', room.id).select('*').single();
      room = checked(update.data as Room | null, update.error);
      return json({ roomId: room.id, token, code: room.code });
    }
    if (payload.action === 'join') {
      const code = text(payload.code, 4).toUpperCase();
      const name = text(payload.name, 24);
      if (!/^[A-Z]{4}$/.test(code) || !name) return fail('Enter a four-letter code and your name.');
      const ip = request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const ipHash = digest(ip);
      const attemptsResponse = await db.from('ito_join_attempts').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('attempted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
      if (attemptsResponse.error) throw new Error(attemptsResponse.error.message);
      if ((attemptsResponse.count ?? 0) >= 30) return fail('Too many join attempts. Try again later.', 429);
      await db.from('ito_join_attempts').insert({ ip_hash: ipHash });
      const token = randomBytes(32).toString('hex');
      const joined = await db.rpc('ito_join_room', { p_code: code, p_name: name, p_token_hash: digest(token) });
      if (joined.error) throw new Error(joined.error.message);
      return json({ roomId: joined.data as string, token, code });
    }
    const { member, room } = await getMember(db, payload);
    if (payload.action === 'snapshot') return json(await snapshot(db, room, member));
    if (payload.action === 'settings') {
      hostOnly(room, member);
      if (room.status !== 'lobby') return fail('Settings can only change in the lobby.');
      const promptText = text(payload.promptText, 120);
      const lowLabel = text(payload.lowLabel, 80);
      const highLabel = text(payload.highLabel, 80);
      const cardsPerPlayer = payload.cardsPerPlayer;
      if (!promptText || !lowLabel || !highLabel || !Number.isInteger(cardsPerPlayer) || (cardsPerPlayer ?? 0) < 1 || (cardsPerPlayer ?? 0) > 5) return fail('Choose a prompt, both scale labels, and 1–5 cards per player.');
      const update = await db.from('ito_rooms').update({ prompt_text: promptText, low_label: lowLabel, high_label: highLabel, cards_per_player: cardsPerPlayer, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }).eq('id', room.id).eq('status', 'lobby').select('id').maybeSingle();
      if (update.error) throw new Error(update.error.message);
      if (!update.data) return fail('The lobby has already changed.');
    } else if (payload.action === 'start') {
      hostOnly(room, member);
      const result = await db.rpc('ito_start_round', { p_room_id: room.id, p_host_id: member.id });
      if (result.error) throw new Error(result.error.message);
    } else if (payload.action === 'clue') {
      if (!isUuid(payload.cardId) || typeof payload.clue !== 'string' || !payload.clue.trim() || payload.clue.trim().length > 80) return fail('Clue must be 1–80 characters.');
      if (!['entry', 'sorting'].includes(room.status)) return fail('Clues are locked now.');
      const saved = await db.rpc('ito_save_clue', { p_room_id: room.id, p_player_id: member.id, p_card_id: payload.cardId, p_clue: payload.clue.trim() });
      if (saved.error) throw new Error(saved.error.message);
    } else if (payload.action === 'sorting') {
      await advance(db, room, member, 'sorting');
    } else if (payload.action === 'reorder' || payload.action === 'lock') {
      if (!Array.isArray(payload.order) || payload.order.some((id) => !isUuid(id))) return fail('Invalid card order.');
      await advance(db, room, member, payload.action, payload.order);
    } else if (payload.action === 'reveal' || payload.action === 'next') {
      await advance(db, room, member, payload.action);
    } else if (payload.action === 'leave') {
      if (room.status !== 'lobby' || room.host_player_id === member.id) return fail('You can leave this room from the lobby only.');
      const update = await db.from('ito_players').update({ active: false }).eq('id', member.id).eq('room_id', room.id);
      if (update.error) throw new Error(update.error.message);
      return json({ left: true });
    } else return fail('Unknown game action.');
    const refreshed = await db.from('ito_rooms').select('*').eq('id', room.id).single();
    return json(await snapshot(db, checked(refreshed.data as Room | null, refreshed.error), member));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return fail(message, /not found|expired|valid session/i.test(message) ? 404 : 400);
  }
};

export const config = { path: '/api/game' };
