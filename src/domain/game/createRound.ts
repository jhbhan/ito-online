import { assignNumbers } from './assignNumbers';
import type { Game, Prompt, Round } from './types';

export function createRound(game: Game, prompt: Prompt): Round {
  const cards = game.players.flatMap((player) => Array.from({ length: game.cardsPerPlayer }, () => ({ id: crypto.randomUUID(), playerId: player.id, text: '' })));
  const numbers = assignNumbers(cards.length);
  return {
    id: crypto.randomUUID(), prompt, participantIds: game.players.map((player) => player.id),
    phase: 'clue-entry',
    assignments: Object.fromEntries(cards.map((card, index) => [card.id, numbers[index]])),
    cards, currentOrder: [], lockedOrder: null, result: null,
  };
}
