import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { gameReducer } from '../domain/game/reducer';
import type { Game, GameCommand } from '../domain/game/types';
import { LocalGameRepository } from '../infrastructure/persistence/LocalGameRepository';

const repository = new LocalGameRepository();
type GameContextValue = { game: Game | null; dispatch: (command: GameCommand) => void };
const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, dispatch] = useReducer(gameReducer, undefined, () => repository.load());
  useEffect(() => { repository.save(game); }, [game]);
  const value = useMemo(() => ({ game, dispatch }), [game]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside GameProvider');
  return context;
}
