import { useState } from 'react';
import type { Player } from '../../domain/game/types';
import { validatePlayers } from '../../domain/game/validation';
import './PlayerSetupForm.css';

export function PlayerSetupForm({ initialPlayers, initialCardsPerPlayer = 1, onStart }: { initialPlayers: Player[]; initialCardsPerPlayer?: number; onStart: (players: Player[], cardsPerPlayer: number) => void }) {
  const [names, setNames] = useState<string[]>(initialPlayers.length ? initialPlayers.map((p) => p.name) : ['', '']);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(initialCardsPerPlayer);
  const [error, setError] = useState('');
  const update = (index: number, value: string) => setNames((items) => items.map((item, i) => i === index ? value : item));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const current = names.filter((name) => name.trim()).map((name, index) => ({ id: initialPlayers[index]?.id ?? crypto.randomUUID(), name: name.trim() }));
    const issue = validatePlayers(current);
    if (issue) { setError(issue); return; }
    onStart(current, cardsPerPlayer);
  };
  return <form className="setup-form" onSubmit={submit}>
    <div className="form-heading"><div><span className="eyebrow">FIRST THINGS FIRST</span><h1>Who’s playing?</h1><p>Add everyone around the table. You can change the group between rounds.</p></div><span className="step-chip">01 <i>/ 03</i></span></div>
    <div className="player-list">{names.map((name, index) => <label className="player-input" key={index}>
      <span className="player-number">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Player ${index + 1} name`} placeholder={`Player ${index + 1}`} value={name} onChange={(event) => update(index, event.target.value)} maxLength={24} />
      {names.length > 2 && <button type="button" className="remove-player" aria-label={`Remove player ${index + 1}`} onClick={() => setNames((items) => items.filter((_, i) => i !== index))}>×</button>}
    </label>)}</div>
    {names.length < 10 && <button type="button" className="text-button add-player" onClick={() => setNames((items) => [...items, ''])}>＋ Add a player</button>}
    <div className="cards-per-player"><div><strong>How many number cards per player?</strong><span>Each card gets its own clue in every round.</span></div><div className="card-count-control"><button type="button" aria-label="Fewer cards per player" disabled={cardsPerPlayer <= 1} onClick={() => setCardsPerPlayer((count) => Math.max(1, count - 1))}>−</button><strong>{cardsPerPlayer}</strong><button type="button" aria-label="More cards per player" disabled={cardsPerPlayer >= 5} onClick={() => setCardsPerPlayer((count) => Math.min(5, count + 1))}>＋</button></div></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="form-footer"><span className="helper-text">2–10 players · {cardsPerPlayer} {cardsPerPlayer === 1 ? 'card' : 'cards'} each · one device</span><button className="button button-primary" type="submit">Pick a prompt <span>→</span></button></div>
  </form>;
}
