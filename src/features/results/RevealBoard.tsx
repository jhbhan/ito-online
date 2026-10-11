import type { Player, Round } from '../../domain/game/types';
import './RevealBoard.css';

export function RevealBoard({ round, roundNumber, players, onNext, onReset }: { round: Round; roundNumber: number; players: Player[]; onNext: () => void; onReset: () => void }) {
  const order = round.lockedOrder ?? round.currentOrder;
  const result = round.result!;
  const pairPercent = result.totalPairs ? Math.round((result.correctlyOrderedPairs / result.totalPairs) * 100) : 100;
  const revealOrder = [...order].sort((a, b) => round.assignments[a] - round.assignments[b]);
  return <section className="play-screen reveal-screen">
    <div className="game-title-row"><div><span className="eyebrow">ROUND {String(roundNumber).padStart(2, '0')} REVEALED · NICE WORK</span><h1>{result.exactOrder ? 'Nailed the order.' : 'How close were you?'}</h1></div><span className={`result-seal ${result.exactOrder ? 'perfect' : ''}`}>{result.exactOrder ? '100%' : `${pairPercent}%`}<small>ORDER</small></span></div>
    <div className="prompt-banner"><span className="tiny-label">THE QUESTION</span><h2>{round.prompt.text}</h2></div>
    <div className="reveal-caption">Here’s the order your group chose. The number cards stay private.</div>
    <div className="reveal-stack horizontal-reveal">{order.map((id, index) => {
      const card = round.cards.find((item) => item.id === id)!;
      const player = players.find((p) => p.id === card.playerId)!;
      const rank = revealOrder.indexOf(id);
      return <div className={`reveal-row ${index === rank ? 'in-place' : ''}`} key={id} style={{ animationDelay: `${index * 90}ms` }}>
        <div className="reveal-card"><span className="sort-card-index">{String(index + 1).padStart(2, '0')}</span><span className="sort-card-name">{player.name}</span><strong>{card.text}</strong></div>
      </div>;
    })}</div>
    <div className="result-note"><span>{result.exactOrder ? '✦' : '↗'}</span><p>{result.exactOrder ? 'Every clue landed in exactly the right order. A rare kind of group mind.' : `${result.correctlyOrderedPairs} of ${result.totalPairs} clue pairs were in the right order. The true order is shown below.`}</p></div>
    {!result.exactOrder && <div className="true-order"><span className="tiny-label">THE CORRECT CLUE ORDER</span><div>{revealOrder.map((id) => <span key={id}>{round.cards.find((card) => card.id === id)?.text}</span>)}</div></div>}
    <div className="game-footer"><button className="text-button" onClick={onReset}>End this game</button><button className="button button-primary" onClick={onNext}>Another round <span>→</span></button></div>
  </section>;
}
