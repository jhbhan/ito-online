import type { Game } from '../../domain/game/types';

export interface GameRepository {
  load(): Game | null;
  save(game: Game | null): void;
  clear(): void;
}
