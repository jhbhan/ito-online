import { useState } from 'react';
import type { Player, Round } from '../../domain/game/types';
import './ModeratorClueEntry.css';

export function ModeratorClueEntry({ round, roundNumber, players, onSave, onBeginSort, onBack }: { round: Round; roundNumber: number; players: Player[]; onSave: (cardId: string, text: string) => void; onBeginSort: () => void; onBack: () => void }) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const cardsWithClues = round.cards.filter((card) => card.text.trim()).length;
  const selectedCard = selectedCardId ? round.cards.find((card) => card.id === selectedCardId) : null;
  const selectedPlayer = selectedCard ? players.find((player) => player.id === selectedCard.playerId) : null;
  const playerCardIndex = selectedCard ? round.cards.filter((card) => card.playerId === selectedCard.playerId).findIndex((card) => card.id === selectedCard.id) : -1;
  const allComplete = round.cards.length > 0 && round.cards.every((card) => card.text.trim());

  const openCard = (cardId: string) => {
    const card = round.cards.find((item) => item.id === cardId);
    if (!card) return;
    setSelectedCardId(cardId);
    setDraft(card.text);
  };
  const saveClue = () => {
    if (!selectedCardId || !draft.trim()) return;
    onSave(selectedCardId, draft);
    setSelectedCardId(null);
    setDraft('');
  };

  return <section className="entry-layout">
    <div className="form-heading"><div><span className="eyebrow">CLUE SETUP · ROUND {String(roundNumber).padStart(2, '0')}</span><h1>{selectedPlayer ? 'Add their clue.' : 'Who has which cards?'}</h1><p>{selectedPlayer ? `Enter one word or phrase for ${selectedPlayer.name}’s card.` : 'Each name card represents one number card. Tap a card to add its clue.'}</p></div><span className="step-chip">03 <i>/ 03</i></span></div>
    <div className="entry-progress"><span>{cardsWithClues} of {round.cards.length} clues in</span><div className="progress-track"><i style={{ width: `${(cardsWithClues / round.cards.length) * 100}%` }} /></div></div>

    {selectedCard && selectedPlayer ? <div className="entry-card"><div className="entry-card-top"><span className="player-avatar">{selectedPlayer.name.trim().slice(0, 1).toUpperCase()}</span><div><span className="tiny-label">PLAYER · NUMBER CARD {String(playerCardIndex + 1).padStart(2, '0')}</span><h2>{selectedPlayer.name}</h2></div></div>
      <div className="entry-prompt"><span className="tiny-label">THE PROMPT</span><p>{round.prompt.text}</p><div className="prompt-ends"><span>0 · {round.prompt.lowLabel}</span><span>100 · {round.prompt.highLabel}</span></div></div>
      <label className="field-label" htmlFor="clue">WORD OR PHRASE FOR THIS CARD</label><input className="clue-input" id="clue" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveClue(); } }} placeholder="A word or short phrase…" maxLength={80} autoComplete="off" autoFocus />
      <div className="entry-card-bottom"><button className="text-button" onClick={() => { setSelectedCardId(null); setDraft(''); }}>← Back to all cards</button><button className="button button-primary" disabled={!draft.trim()} onClick={saveClue}>{selectedCard.text ? 'Update clue' : 'Save clue'} <span>✓</span></button></div>
    </div> : <>
      <div className="roster-grid">{round.cards.map((card, index) => {
        const player = players.find((item) => item.id === card.playerId)!;
        const cardIndex = round.cards.filter((item) => item.playerId === card.playerId).findIndex((item) => item.id === card.id);
        const done = Boolean(card.text.trim());
        return <button key={card.id} className={`roster-player ${done ? 'is-complete' : ''}`} onClick={() => openCard(card.id)}>
          <span className="roster-index">{String(index + 1).padStart(2, '0')}</span><span className="player-avatar">{player.name.trim().slice(0, 1).toUpperCase()}</span><span className="roster-name-wrap"><strong>{player.name}</strong><small>Card {cardIndex + 1} · {done ? 'Clue added · edit' : 'Add a clue'}</small></span><span className="roster-status" aria-hidden="true">{done ? '✓' : '＋'}</span>
        </button>;
      })}</div>
      <div className="entry-bottom"><button className="text-button" onClick={onBack}>← Change prompt</button><button className="button button-primary" disabled={!allComplete} onClick={onBeginSort}>Arrange the clues <span>→</span></button></div>
    </>}
  </section>;
}
