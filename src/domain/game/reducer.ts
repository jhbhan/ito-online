import { createRound } from './createRound';
import { scoreOrder } from './scoring';
import type { Game, GameCommand, PlayerId, Round } from './types';

export function activeRound(game: Game): Round | null {
  return game.rounds.find((round) => round.id === game.activeRoundId) ?? null;
}

export function gameReducer(game: Game | null, command: GameCommand): Game | null {
  if (command.type === 'RESET_GAME') return null;
  if (!game && command.type !== 'SET_PLAYERS') return game;
  if (command.type === 'SET_PLAYERS') {
    const cardsPerPlayer = Math.max(1, Math.min(5, command.cardsPerPlayer ?? game?.cardsPerPlayer ?? 1));
    if (!game) return { id: crypto.randomUUID(), players: command.players, rounds: [], activeRoundId: null, entryMode: 'moderator', cardsPerPlayer, createdAt: new Date().toISOString() };
    return { ...game, players: command.players, cardsPerPlayer };
  }
  if (!game) return game;
  if (command.type === 'START_ROUND') {
    const round = createRound(game, command.prompt);
    return { ...game, rounds: [...game.rounds, round], activeRoundId: round.id };
  }
  const round = activeRound(game);
  if (!round) return game;
  const replaceRound = (next: Round) => ({ ...game, rounds: game.rounds.map((item) => item.id === next.id ? next : item) });
  switch (command.type) {
    case 'UPDATE_PROMPT':
      if (round.phase !== 'clue-entry') return game;
      {
        const freshRound = createRound(game, command.prompt);
        return { ...game, rounds: game.rounds.map((item) => item.id === round.id ? freshRound : item), activeRoundId: freshRound.id };
      }
    case 'SAVE_CLUE': {
      if (round.phase !== 'clue-entry' || !round.participantIds.includes(command.playerId)) return game;
      const text = command.text.trim();
      const card = round.cards.find((item) => item.playerId === command.playerId);
      if (!card) return game;
      return replaceRound({ ...round, cards: round.cards.map((item) => item.id === card.id ? { ...item, text } : item) });
    }
    case 'SAVE_CARD_CLUE': {
      if (round.phase !== 'clue-entry') return game;
      const card = round.cards.find((item) => item.id === command.cardId);
      if (!card) return game;
      return replaceRound({ ...round, cards: round.cards.map((item) => item.id === card.id ? { ...item, text: command.text.trim() } : item) });
    }
    case 'START_SORTING': {
      if (round.phase !== 'clue-entry' || round.cards.some((card) => !card.text.trim())) return game;
      return replaceRound({ ...round, phase: 'sorting', currentOrder: round.cards.map((card) => card.id) });
    }
    case 'RETURN_TO_CLUE_ENTRY':
      return round.phase === 'sorting' ? replaceRound({ ...round, phase: 'clue-entry' }) : game;
    case 'REORDER_CLUES': {
      const cardIds = round.cards.map((card) => card.id);
      const valid = command.order.length === cardIds.length && new Set(command.order).size === command.order.length && command.order.every((id: PlayerId) => cardIds.includes(id));
      return round.phase === 'sorting' && valid ? replaceRound({ ...round, currentOrder: command.order }) : game;
    }
    case 'REVEAL_ROUND':
      if (round.phase !== 'sorting') return game;
      return replaceRound({ ...round, phase: 'revealed', lockedOrder: [...round.currentOrder], result: scoreOrder(round.currentOrder, round.assignments) });
    default:
      return game;
  }
}
