import type { Player } from './types';

export function validatePlayers(players: Player[]): string | null {
  if (players.length < 2 || players.length > 10) return 'Add between 2 and 10 players to get started.';
  if (players.some((player) => !player.name.trim())) return 'Every player needs a name.';
  const names = players.map((player) => player.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) return 'Player names need to be unique.';
  return null;
}
