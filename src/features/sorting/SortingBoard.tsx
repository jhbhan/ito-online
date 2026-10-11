import { useEffect, useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Player, Round } from '../../domain/game/types';

function SortableCard({ id, name, clue, index }: { id: string; name: string; clue: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`sort-card ${isDragging ? 'dragging' : ''}`} {...attributes} {...listeners}>
    <span className="sort-card-index">{String(index + 1).padStart(2, '0')}</span><span className="sort-card-name">{name}</span><strong>{clue}</strong><span className="drag-grip" aria-hidden="true">⠿</span>
  </article>;
}

export function SortingBoard({ round, roundNumber, players, onReorder, onReveal, onBack }: { round: Round; roundNumber: number; players: Player[]; onReorder: (order: string[]) => void; onReveal: () => void; onBack: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const updateLayout = () => setIsNarrow(media.matches);
    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);
  const clues = useMemo(() => round.currentOrder.map((id) => { const card = round.cards.find((item) => item.id === id)!; return { id, name: players.find((p) => p.id === card.playerId)?.name ?? 'Player', text: card.text }; }), [round, players]);
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = round.currentOrder.indexOf(String(event.active.id));
    const newIndex = round.currentOrder.indexOf(String(event.over.id));
    onReorder(arrayMove(round.currentOrder, oldIndex, newIndex));
  };
  return <section className="play-screen">
    <div className="game-title-row"><div><span className="eyebrow">ROUND {String(roundNumber).padStart(2, '0')} · MAKE YOUR CASE</span><h1>Put the clues in order.</h1></div><span className="round-stamp">YOUR GROUP’S<br />BEST GUESS</span></div>
    <div className="prompt-banner"><span className="tiny-label">THE QUESTION</span><h2>{round.prompt.text}</h2></div>
    <div className="scale-labels"><span><b>0</b>{round.prompt.lowLabel}</span><span>{round.prompt.highLabel}<b>100</b></span></div>
    <div className="scale-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    <div className="sort-instruction"><span className="sparkle" aria-hidden="true">✳</span> Drag the clues from <strong>least</strong> to <strong>most</strong>. With a keyboard, press Space to pick up a card, arrow keys to move, then Space to drop.</div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={round.currentOrder} strategy={isNarrow ? verticalListSortingStrategy : horizontalListSortingStrategy}>
        <div className={`sort-cards ${isNarrow ? 'vertical' : ''}`}>{clues.map((clue, index) => <SortableCard key={clue.id} id={clue.id} name={clue.name} clue={clue.text} index={index} />)}</div>
      </SortableContext>
    </DndContext>
    <div className="game-footer"><button className="text-button" onClick={onBack}>← Edit clues</button><button className="button button-primary" onClick={onReveal}>Lock it in <span>→</span></button></div>
  </section>;
}
