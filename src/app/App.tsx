import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameProvider, useGame } from '../state/GameProvider';
import { activeRound } from '../domain/game/reducer';
import type { Player, Prompt } from '../domain/game/types';
import { PlayerSetupForm } from '../features/players/PlayerSetupForm';
import { PromptSelection } from '../features/prompts/PromptSelection';
import { ModeratorClueEntry } from '../features/clue-entry/ModeratorClueEntry';
import { SortingBoard } from '../features/sorting/SortingBoard';
import { RevealBoard } from '../features/results/RevealBoard';
import { OnlineApp } from '../online/OnlineApp';

function GameApp() {
  const { game, dispatch } = useGame();
  const navigate = useNavigate();
  const { stage } = useParams();
  const [draftPlayers, setDraftPlayers] = useState<Player[]>(game?.players ?? []);
  const round = game ? activeRound(game) : null;
  const roundNumber = game && round ? game.rounds.findIndex((item) => item.id === round.id) + 1 : 1;
  const go = (next: string) => navigate(`/game/${next}`);
  const startGame = (players: Player[], cardsPerPlayer: number) => { setDraftPlayers(players); dispatch({ type: 'SET_PLAYERS', players, cardsPerPlayer }); go('prompt'); };
  const choosePrompt = (prompt: Prompt) => {
    if (round?.phase === 'clue-entry') dispatch({ type: 'UPDATE_PROMPT', prompt });
    else dispatch({ type: 'START_ROUND', prompt });
    go('entry');
  };
  const reset = () => { dispatch({ type: 'RESET_GAME' }); setDraftPlayers([]); go('setup'); };
  return <div className="app-shell">
    <header className="site-header"><button className="brand" onClick={() => go('setup')} aria-label="ito — player setup"><span className="brand-mark">ito<span>·</span></span><span className="brand-caption">A LITTLE GAME<br />OF PERSPECTIVE</span></button><div className="header-right"><span className="header-note"><i /> ONE DEVICE · EVERYONE PLAYS</span><button className="header-menu" onClick={() => go('setup')}>Players</button></div></header>
    <main className="main-content">
      {stage === 'setup' && <PlayerSetupForm initialPlayers={game?.players ?? draftPlayers} initialCardsPerPlayer={game?.cardsPerPlayer} onStart={startGame} />}
      {stage === 'prompt' && <PromptSelection onChoose={choosePrompt} onBack={() => go('setup')} />}
      {stage === 'entry' && round && <ModeratorClueEntry key={round.id} round={round} roundNumber={roundNumber} players={game!.players} onSave={(cardId, text) => dispatch({ type: 'SAVE_CARD_CLUE', cardId, text })} onBeginSort={() => { dispatch({ type: 'START_SORTING' }); go('sort'); }} onBack={() => go('prompt')} />}
      {stage === 'sort' && round && round.phase === 'sorting' && <SortingBoard round={round} roundNumber={roundNumber} players={game!.players} onReorder={(order) => dispatch({ type: 'REORDER_CLUES', order })} onReveal={() => { dispatch({ type: 'REVEAL_ROUND' }); go('reveal'); }} onBack={() => { dispatch({ type: 'RETURN_TO_CLUE_ENTRY' }); go('entry'); }} />}
      {stage === 'reveal' && round && round.phase === 'revealed' && <RevealBoard round={round} roundNumber={roundNumber} players={game!.players} onNext={() => go('prompt')} onReset={reset} />}
      {(!stage || !['setup', 'prompt', 'entry', 'sort', 'reveal'].includes(stage)) && <PlayerSetupForm initialPlayers={game?.players ?? draftPlayers} initialCardsPerPlayer={game?.cardsPerPlayer} onStart={startGame} />}
      {stage === 'sort' && round?.phase !== 'sorting' && <PlayerSetupForm initialPlayers={game?.players ?? []} initialCardsPerPlayer={game?.cardsPerPlayer} onStart={startGame} />}
    </main>
    <footer className="site-footer"><span>MADE FOR GOOD CONVERSATIONS</span><span>TAKE YOUR TIME · TRUST YOUR GUT</span></footer>
  </div>;
}

export function App() {
  return <GameProvider><GameRoutes /></GameProvider>;
}

import { Route, Routes, Navigate } from 'react-router-dom';
function GameRoutes() { return <Routes><Route path="/" element={<Navigate to="/online" replace />} /><Route path="/online" element={<OnlineApp />} /><Route path="/game/:stage" element={<GameApp />} /><Route path="*" element={<Navigate to="/online" replace />} /></Routes>; }
