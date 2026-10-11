export type PlayerId = string;
export type RoundPhase = 'clue-entry' | 'sorting' | 'revealed';
export type EntryMode = 'moderator' | 'private';

export type Player = { id: PlayerId; name: string };
export type Prompt = {
  id: string;
  text: string;
  lowLabel: string;
  highLabel: string;
  category?: string;
};
export type ClueSubmission = { playerId: PlayerId; text: string; submittedAt: string };
export type ClueCard = { id: string; playerId: PlayerId; text: string };
export type RoundResult = { exactOrder: boolean; correctlyOrderedPairs: number; totalPairs: number };
export type Round = {
  id: string;
  prompt: Prompt;
  participantIds: PlayerId[];
  phase: RoundPhase;
  assignments: Record<string, number>;
  cards: ClueCard[];
  currentOrder: PlayerId[];
  lockedOrder: PlayerId[] | null;
  result: RoundResult | null;
};
export type Game = {
  id: string;
  players: Player[];
  rounds: Round[];
  activeRoundId: string | null;
  entryMode: EntryMode;
  cardsPerPlayer: number;
  createdAt: string;
};

export type GameCommand =
  | { type: 'SET_PLAYERS'; players: Player[]; cardsPerPlayer?: number }
  | { type: 'START_ROUND'; prompt: Prompt }
  | { type: 'UPDATE_PROMPT'; prompt: Prompt }
  | { type: 'SAVE_CLUE'; playerId: PlayerId; text: string }
  | { type: 'SAVE_CARD_CLUE'; cardId: string; text: string }
  | { type: 'START_SORTING' }
  | { type: 'RETURN_TO_CLUE_ENTRY' }
  | { type: 'REORDER_CLUES'; order: PlayerId[] }
  | { type: 'REVEAL_ROUND' }
  | { type: 'RESET_GAME' };
