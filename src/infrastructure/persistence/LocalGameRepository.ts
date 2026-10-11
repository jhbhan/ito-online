import type { Game } from '../../domain/game/types';
import type { GameRepository } from './GameRepository';

const KEY = 'ito-moderator.saved-game';
const isGame = (value: unknown): value is Game => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Game>;
  return typeof item.id === 'string' && Array.isArray(item.players) && Array.isArray(item.rounds) && (item.activeRoundId === null || typeof item.activeRoundId === 'string') && (item.rounds.length === 0 || item.rounds.every((round) => !!round && typeof round === 'object' && Array.isArray((round as { cards?: unknown }).cards)));
};

export class LocalGameRepository implements GameRepository {
  load(): Game | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { schemaVersion?: number; game?: unknown };
      if (saved.schemaVersion !== 1 || !isGame(saved.game)) return null;
      return { ...saved.game, cardsPerPlayer: Math.max(1, Math.min(5, saved.game.cardsPerPlayer ?? 1)) };
    } catch { return null; }
  }
  save(game: Game | null): void {
    try {
      if (!game) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, savedAt: new Date().toISOString(), game }));
    } catch { /* The game remains playable in memory if browser storage is unavailable. */ }
  }
  clear(): void { try { localStorage.removeItem(KEY); } catch { /* Ignore unavailable storage. */ } }
}
