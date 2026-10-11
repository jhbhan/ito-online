export type OnlineSession = { roomId: string; token: string; code: string };
export type RoomStatus = 'lobby' | 'entry' | 'sorting' | 'revealing' | 'results';
export type OnlinePlayer = { id: string; name: string; active: boolean; joined_at: string };
export type OnlineCard = {
  id: string; ownerId: string; slot: number; position: number; submitted: boolean;
  clue: string; value: number | null;
};
export type OnlineSnapshot = {
  room: {
    id: string; code: string; hostPlayerId: string; status: RoomStatus; promptText: string; lowLabel: string;
    highLabel: string; cardsPerPlayer: number; expiresAt: string;
  };
  me: { id: string; name: string; isHost: boolean };
  players: OnlinePlayer[];
  round: null | {
    id: string; phase: RoomStatus; lockedOrder: string[] | null; revealIndex: number; cards: OnlineCard[];
  };
};
