import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useSearchParams } from 'react-router-dom';
import { prompts } from '../data/prompts/promptCatalog';
import { gameRequest, loadSession, saveSession, type MutationResult } from './api';
import type { OnlineCard, OnlineSession, OnlineSnapshot } from './types';
import './OnlineApp.css';

const codeLettersFrom = (value: string) => Array.from({ length: 4 }, (_, index) => value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)[index] ?? '');

function RoomCodeInput({ letters, onChange, onEnter, disabled }: { letters: string[]; onChange: (letters: string[]) => void; onEnter: () => void; disabled: boolean }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const applyInput = (index: number, raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z]/g, '');
    const next = [...letters];
    if (!clean) {
      next[index] = '';
      onChange(next);
      return;
    }
    const start = clean.length >= 4 ? 0 : index;
    for (let offset = 0; offset < clean.length && start + offset < 4; offset += 1) next[start + offset] = clean[offset];
    onChange(next);
    inputs.current[Math.min(start + clean.length, 3)]?.focus();
  };
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...letters];
      next[index] = '';
      if (!letters[index] && index > 0) next[index - 1] = '';
      onChange(next);
      if (index > 0) inputs.current[index - 1]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onEnter();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < 3) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  };
  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    applyInput(index, event.clipboardData.getData('text'));
  };
  return <div className="online-code-group" role="group" aria-label="Four-letter room code">
    {letters.map((letter, index) => <input
      key={index}
      ref={(element) => { inputs.current[index] = element; }}
      className="online-code-letter"
      value={letter}
      onChange={(event: ChangeEvent<HTMLInputElement>) => applyInput(index, event.target.value)}
      onKeyDown={(event) => onKeyDown(index, event)}
      onPaste={(event) => onPaste(index, event)}
      onFocus={(event) => event.target.select()}
      aria-label={`Room code letter ${index + 1} of 4`}
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      autoCapitalize="characters"
      inputMode="text"
      maxLength={4}
      disabled={disabled}
    />)}
  </div>;
}

function ClueCard({ card, name, index, total, draggable, busy, onMove }: { card: OnlineCard; name: string; index: number; total: number; draggable: boolean; busy: boolean; onMove: (index: number, direction: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !draggable || busy });
  return <article ref={setNodeRef} className={`online-board-card ${isDragging ? 'is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <span className="online-card-index">{String(index + 1).padStart(2, '0')}</span>
    <span className="online-card-name">{name} · card {card.slot}</span>
    <strong>{card.clue}</strong>
    {draggable && <div className="online-card-controls">
      <button type="button" className="online-move-button" aria-label={`Move ${card.clue} left`} disabled={busy || index === 0} onClick={() => onMove(index, -1)}>←</button>
      <button type="button" className="online-drag-handle" ref={setActivatorNodeRef} aria-label={`Drag ${card.clue} to reorder`} disabled={busy} {...attributes} {...listeners}>⠿</button>
      <button type="button" className="online-move-button" aria-label={`Move ${card.clue} right`} disabled={busy || index === total - 1} onClick={() => onMove(index, 1)}>→</button>
    </div>}
  </article>;
}

function PrivateCard({ card, promptText, onSave, busy }: { card: OnlineCard; promptText: string; onSave: (id: string, clue: string) => Promise<boolean>; busy: boolean }) {
  const [draft, setDraft] = useState(card.clue);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(card.clue); }, [card.clue, dirty]);
  const changed = draft.trim() !== card.clue;
  return <form className="online-private-card" onSubmit={async (event) => { event.preventDefault(); if (draft.trim() && changed && await onSave(card.id, draft.trim())) setDirty(false); }}>
    <div className="online-private-top"><span className="online-label">YOUR CARD {card.slot}</span><span className="online-private-value">{card.value ?? '—'}</span></div>
    <p>{promptText}</p>
    <label htmlFor={`clue-${card.id}`}>Your clue</label>
    <div className="online-clue-edit"><input id={`clue-${card.id}`} value={draft} onChange={(event) => { setDraft(event.target.value); setDirty(true); }} maxLength={80} placeholder="A word or short phrase…" /><button type="submit" className="button button-primary" disabled={busy || !draft.trim() || !changed}>{card.submitted ? 'Update clue' : 'Save clue'}</button></div>
    <span className={`online-help ${card.submitted && !changed ? 'online-saved-message' : ''}`}>{card.submitted ? (changed ? 'Unsaved changes' : '✓ Saved · editable until the order is locked') : 'Only you can see this number and clue right now.'}</span>
  </form>;
}

function LobbySettings({ snapshot, busy, onSave, onStart }: { snapshot: OnlineSnapshot; busy: boolean; onSave: (values: Record<string, unknown>) => Promise<boolean>; onStart: () => Promise<boolean> }) {
  const room = snapshot.room;
  const [promptText, setPromptText] = useState(room.promptText);
  const [lowLabel, setLowLabel] = useState(room.lowLabel);
  const [highLabel, setHighLabel] = useState(room.highLabel);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(room.cardsPerPlayer);
  const allValid = promptText.trim() && lowLabel.trim() && highLabel.trim() && cardsPerPlayer >= 1 && cardsPerPlayer <= 5;
  const changed = promptText.trim() !== room.promptText || lowLabel.trim() !== room.lowLabel || highLabel.trim() !== room.highLabel || cardsPerPlayer !== room.cardsPerPlayer;
  const activePlayers = snapshot.players.filter((player) => player.active).length;
  const startDisabledReason = !allValid
    ? 'Complete the prompt, both scale labels, and number cards per player.'
    : changed
      ? 'Save your settings before starting the round.'
      : activePlayers < 2
        ? 'Invite at least one more player to start a round.'
        : busy
          ? 'Please wait for the current change to finish.'
          : '';
  return <section className="online-panel">
    <div className="online-section-heading"><div><span className="online-label">ROOM SETTINGS</span><h2>Set the round.</h2></div><span className="online-chip">MODERATOR</span></div>
    <label className="online-field">Prompt<select value={prompts.some((prompt) => prompt.text === promptText) ? promptText : '__custom__'} onChange={(event) => { const choice = prompts.find((prompt) => prompt.text === event.target.value); if (choice) { setPromptText(choice.text); setLowLabel(choice.lowLabel); setHighLabel(choice.highLabel); } }}><option value="__custom__">Custom prompt</option>{prompts.map((prompt) => <option key={prompt.id} value={prompt.text}>{prompt.text}</option>)}</select></label>
    <label className="online-field">Prompt text<input value={promptText} maxLength={120} onChange={(event) => setPromptText(event.target.value)} /></label>
    <div className="online-two-fields"><label className="online-field">0 means<input value={lowLabel} maxLength={80} onChange={(event) => setLowLabel(event.target.value)} /></label><label className="online-field">100 means<input value={highLabel} maxLength={80} onChange={(event) => setHighLabel(event.target.value)} /></label></div>
    <label className="online-field">Number cards per player<select value={cardsPerPlayer} onChange={(event) => setCardsPerPlayer(Number(event.target.value))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'card' : 'cards'} each</option>)}</select></label>
    <div className="online-actions"><button className="button button-secondary" disabled={busy || !allValid || !changed} onClick={() => onSave({ promptText: promptText.trim(), lowLabel: lowLabel.trim(), highLabel: highLabel.trim(), cardsPerPlayer })}>Save settings</button><button className="button button-primary" disabled={Boolean(startDisabledReason)} aria-describedby={startDisabledReason ? 'online-start-reason' : undefined} onClick={onStart}>Start round →</button></div>
    {startDisabledReason && <p id="online-start-reason" className="online-start-reason" role="status">{startDisabledReason}</p>}
  </section>;
}

export function OnlineApp() {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<OnlineSession | null>(() => loadSession());
  const [snapshot, setSnapshot] = useState<OnlineSnapshot | null>(null);
  const [name, setName] = useState('');
  const inviteCode = searchParams.get('code');
  const [codeLetters, setCodeLetters] = useState(() => codeLettersFrom(inviteCode ?? ''));
  const code = codeLetters.join('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exitNotice, setExitNotice] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [loading, setLoading] = useState(Boolean(loadSession()));
  const requestEpoch = useRef(0);
  useEffect(() => { if (inviteCode) setCodeLetters(codeLettersFrom(inviteCode)); }, [inviteCode]);

  const clearSession = useCallback((notice = '') => {
    requestEpoch.current += 1;
    saveSession(null);
    setSession(null);
    setSnapshot(null);
    setLoading(false);
    setError('');
    setExitNotice(notice);
  }, []);

  const refresh = useCallback(async (activeSession: OnlineSession) => {
    const epoch = requestEpoch.current;
    const state = await gameRequest<OnlineSnapshot>('snapshot', {}, activeSession);
    if (epoch !== requestEpoch.current) return;
    if (state.room.status === 'closed') {
      clearSession('The host closed the room. You have been returned to the start screen.');
      return;
    }
    setSnapshot(state);
    setError('');
    setLoading(false);
  }, [clearSession]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const check = async () => {
      try { if (live) await refresh(session); }
      catch (cause) {
        if (!live) return;
        const message = cause instanceof Error ? cause.message : 'Could not reconnect.';
        if (/no longer valid|expired|not found/i.test(message)) { saveSession(null); setSession(null); setSnapshot(null); }
        setError(message); setLoading(false);
      }
    };
    void check();
    const timer = window.setInterval(check, 2500);
    const onVisibility = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [session, refresh]);

  const begin = async (action: 'create' | 'join') => {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setBusy(true); setError(''); setExitNotice('');
    try {
      const next = await gameRequest<OnlineSession>(action, { name: name.trim(), ...(action === 'join' ? { code } : {}) });
      saveSession(next); setSession(next); setLoading(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect.'); }
    finally { setBusy(false); }
  };
  const mutate = async (action: 'settings' | 'start' | 'clue' | 'sorting' | 'reorder' | 'lock' | 'reveal' | 'next' | 'leave' | 'close', body: Record<string, unknown> = {}) => {
    if (!session) return false;
    requestEpoch.current += 1;
    setBusy(true); setError('');
    try {
      if (action === 'leave') {
        await gameRequest<{ left: true }>(action, body, session);
        clearSession();
        return true;
      } else {
        const next = await gameRequest<MutationResult>(action, body, session);
        if (next.room.status === 'closed') {
          clearSession('Room closed for everyone.');
          return true;
        }
        setSnapshot(next);
        return true;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save.'); return false; }
    finally { requestEpoch.current += 1; setBusy(false); }
  };
  const room = snapshot?.room;
  const round = snapshot?.round;
  const me = snapshot?.me;
  const myCards = useMemo(() => round?.cards.filter((card) => card.ownerId === me?.id).sort((a, b) => a.slot - b.slot) ?? [], [round, me]);
  const orderedCards = useMemo(() => round?.cards.slice().sort((a, b) => a.position - b.position) ?? [], [round]);
  const completeCount = round?.cards.filter((card) => card.submitted).length ?? 0;
  const allComplete = Boolean(round?.cards.length && completeCount === round.cards.length);
  const playerName = (id: string) => snapshot?.players.find((player) => player.id === id)?.name ?? 'Player';
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id || busy) return;
    const oldIndex = orderedCards.findIndex((card) => card.id === event.active.id);
    const newIndex = orderedCards.findIndex((card) => card.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    void mutate('reorder', { order: arrayMove(orderedCards.map((card) => card.id), oldIndex, newIndex) });
  };
  const moveCard = (index: number, direction: -1 | 1) => {
    if (busy || index + direction < 0 || index + direction >= orderedCards.length) return;
    void mutate('reorder', { order: arrayMove(orderedCards.map((card) => card.id), index, index + direction) });
  };
  const copyJoin = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(`${location.origin}/online?code=${room.code}`); setCopyMessage('Link copied. Send it to your players.'); }
    catch { setCopyMessage('Copy the link below to invite players.'); }
  };
  const closeRoom = () => {
    if (!room || !window.confirm(`Close room ${room.code} for everyone? This ends the game and removes all round cards and numbers.`)) return;
    void mutate('close');
  };
  const revealOrder = round?.lockedOrder ?? orderedCards.map((card) => card.id);
  const revealed = round && ['revealing','results'].includes(room?.status ?? '') ? round.revealIndex : 0;
  const actual = room?.status === 'results' ? [...orderedCards].sort((a, b) => (a.value ?? 0) - (b.value ?? 0)) : [];
  const exact = actual.length > 0 && actual.every((card, index) => card.id === revealOrder[index]);
  const phaseIndex = room?.status === 'lobby' ? 0 : room?.status === 'entry' ? 1 : room?.status === 'sorting' ? 2 : 3;
  const phases = ['Lobby', 'Clues', 'Arrange', 'Reveal'];

  return <div className="app-shell online-app">
    <header className="site-header"><Link className="brand online-brand" to="/online"><span className="brand-mark">ito<span>·</span></span><span className="brand-caption">PLAY TOGETHER<br />FROM ANYWHERE</span></Link><div className="header-right">{room ? <span className="online-room-pill">ROOM {room.code}</span> : <Link className="header-menu online-local-link" to="/game/setup">One-device game</Link>}</div></header>
    <main className="main-content online-main">
      {exitNotice && <p className="online-notice" role="status">{exitNotice}</p>}
      {!session && <section className="online-welcome">
        <span className="eyebrow">A LITTLE GAME OF PERSPECTIVE</span>
        <h1>See things differently, together.</h1>
        <p className="online-welcome-lede">Give a clue for your secret number, then work together to put everyone's clues in order.</p>
        <div className="online-name-bar online-panel">
          <div><span className="online-label">BEFORE YOU PLAY</span><h2>What should we call you?</h2><p>The host plays too.</p></div>
          <label className="online-field">Your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="Enter your name" autoComplete="nickname" /></label>
        </div>
        <div className="online-entry-grid">
          <div className="online-panel online-choice-card">
            <span className="online-label">START A GAME</span>
            <h2>Create a room</h2>
            <p>Pick the prompt and invite your friends. You'll get a four-letter code to share.</p>
            <button className="button button-primary online-full-button" disabled={busy || !name.trim()} onClick={() => void begin('create')}>Create a game <span aria-hidden="true">→</span></button>
          </div>
          <div className="online-panel online-choice-card">
            <span className="online-label">JOIN FRIENDS</span>
            <h2>Enter a room code</h2>
            <p>Type the four letters your host shared with you.</p>
            <RoomCodeInput letters={codeLetters} onChange={setCodeLetters} onEnter={() => { if (!busy && name.trim() && code.length === 4) void begin('join'); }} disabled={busy} />
            <button className="button button-secondary online-full-button" disabled={busy || !name.trim() || code.length !== 4} onClick={() => void begin('join')}>Join game <span aria-hidden="true">→</span></button>
            {(!name.trim() || code.length !== 4) && <p className="online-action-hint">{!name.trim() ? 'Enter your name above to join.' : 'Enter all four letters to join.'}</p>}
          </div>
        </div>
      </section>}
      {session && loading && <section className="online-centered"><h1>Connecting to your room…</h1><p>Finding the latest game state.</p></section>}
      {room && snapshot && !loading && <section className="online-game">
        <div className="online-topline"><div><span className="eyebrow">ROOM {room.code} · {room.status.toUpperCase()}</span><h1>{room.status === 'lobby' ? 'Gather your people.' : room.status === 'entry' ? 'Your private cards.' : room.status === 'sorting' ? 'Find the order.' : room.status === 'revealing' ? 'The reveal.' : room.status === 'closed' ? 'This room is closed.' : 'How did you do?'}</h1></div>{me?.isHost && room.status !== 'closed' && <button className="button button-secondary online-close-button" disabled={busy} onClick={closeRoom}>Close room</button>}</div>
        {room.status !== 'closed' && <ol className="online-phase-steps" aria-label="Round progress">{phases.map((phase, index) => <li key={phase} className={index === phaseIndex ? 'is-current' : index < phaseIndex ? 'is-complete' : ''} aria-current={index === phaseIndex ? 'step' : undefined}><span>{index < phaseIndex ? '✓' : index + 1}</span>{phase}</li>)}</ol>}
        {room.status === 'closed' && <section className="online-panel online-closed-panel"><p>The moderator closed this room. Its cards and private numbers have been removed.</p><button className="button button-primary" onClick={() => clearSession()}>Back to home →</button></section>}
        {room.status === 'lobby' && <div className="online-lobby-grid">
          <section className="online-panel online-invite-panel">
            <span className="online-label">INVITE YOUR GROUP</span>
            <h2>Share this room code</h2>
            <div className="online-code-display" aria-label={`Room code ${room.code}`}>{room.code}</div>
            <button className="button button-secondary online-copy-button" onClick={() => void copyJoin()}>Copy invite link</button>
            <p className="online-help" role="status">{copyMessage || 'Friends can use the link or enter the code on this site.'}</p>
            {copyMessage.startsWith('Copy the link') && <input className="online-share-url" aria-label="Invite link" readOnly value={`${location.origin}/online?code=${room.code}`} onFocus={(event) => event.target.select()} />}
            <div className="online-player-heading"><h3>Players</h3><span>{snapshot.players.filter((player) => player.active).length} / 10</span></div>
            <div className="online-player-list">{snapshot.players.filter((player) => player.active).map((player) => <div key={player.id}><span className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}{player.id === me?.id ? ' · you' : ''}</strong>{player.id === room.hostPlayerId && <span className="online-chip">HOST</span>}</div>)}</div>
            {!me?.isHost && <button className="text-button" onClick={() => void mutate('leave')}>Leave room</button>}
          </section>
          {me?.isHost ? <LobbySettings snapshot={snapshot} busy={busy} onSave={(values) => mutate('settings', values)} onStart={() => mutate('start')} /> : <section className="online-panel"><span className="online-label">ROUND SETTINGS</span><h2>Waiting for the host.</h2><p>{room.promptText}</p><p className="online-help">{room.cardsPerPlayer} {room.cardsPerPlayer === 1 ? 'number card' : 'number cards'} per player · {room.lowLabel} to {room.highLabel}</p></section>}
        </div>}
        {room.status === 'entry' && round && <><div className="online-prompt-banner"><span className="online-label">THE PROMPT</span><h2>{room.promptText}</h2><p>0 · {room.lowLabel} <span>100 · {room.highLabel}</span></p></div><div className="online-private-grid">{myCards.map((card) => <PrivateCard key={card.id} card={card} promptText={room.promptText} busy={busy} onSave={(id, clue) => mutate('clue', { cardId: id, clue })} />)}</div><div className="online-progress-panel"><div><strong>{completeCount} of {round.cards.length} clues submitted</strong><p>Everyone can edit their own clues until the order is locked.</p></div>{me?.isHost && <button className="button button-primary" disabled={busy || !allComplete} onClick={() => void mutate('sorting')}>Start sorting →</button>}</div></>}
        {room.status === 'sorting' && round && <><div className="online-prompt-banner"><span className="online-label">THE PROMPT</span><h2>{room.promptText}</h2><p>0 · {room.lowLabel} <span>100 · {room.highLabel}</span></p></div><p className="online-instruction">{me?.isHost ? 'Put the clues in order from lowest to highest. Drag the grip or use the arrows on each card.' : 'The host is arranging the clues. You can still edit your own clue below.'}</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={orderedCards.map((card) => card.id)} strategy={horizontalListSortingStrategy}><div className="online-board" aria-label="Clue cards ordered from low to high">{orderedCards.map((card, index) => <ClueCard key={card.id} card={card} name={playerName(card.ownerId)} index={index} total={orderedCards.length} draggable={Boolean(me?.isHost)} busy={busy} onMove={moveCard} />)}</div></SortableContext></DndContext><p className="online-scroll-hint">Scroll sideways to see every card · lowest on the left</p>{me?.isHost && <div className="online-actions"><button className="button button-primary" disabled={busy || !allComplete} onClick={() => void mutate('lock', { order: orderedCards.map((card) => card.id) })}>Lock order & begin reveal →</button></div>}{myCards.length > 0 && <details className="online-edit-details"><summary>Edit your clues</summary><div className="online-private-grid">{myCards.map((card) => <PrivateCard key={card.id} card={card} promptText={room.promptText} busy={busy} onSave={(id, clue) => mutate('clue', { cardId: id, clue })} />)}</div></details>}</>}
        {['revealing','results'].includes(room.status) && round && <><div className="online-prompt-banner"><span className="online-label">THE PROMPT</span><h2>{room.promptText}</h2><p>{room.status === 'results' ? 'All numbers are revealed. Compare the clues below.' : 'Numbers appear one card at a time.'}</p></div><div className="online-board online-reveal-board">{revealOrder.map((id, index) => { const card = round.cards.find((item) => item.id === id)!; const isRevealed = index < revealed; return <article className={`online-board-card ${isRevealed ? 'online-revealed' : ''}`} key={id}><span className="online-card-index">{String(index + 1).padStart(2, '0')}</span><span className="online-card-name">{playerName(card.ownerId)} · card {card.slot}</span><strong>{card.clue}</strong><span className="online-reveal-value">{isRevealed ? card.value : 'Hidden'}</span></article>; })}</div><p className="online-scroll-hint">Scroll sideways to see every card · lowest on the left</p><div className="online-progress-panel"><div><strong>{revealed} of {round.cards.length} cards revealed</strong><p>{room.status === 'results' ? (exact ? 'Every clue was in the right order.' : 'The round is complete. Compare the true order below.') : 'Take your time with each clue.'}</p></div>{me?.isHost && room.status === 'revealing' && <button className="button button-primary" disabled={busy} onClick={() => void mutate('reveal')}>Reveal next card →</button>}</div>{room.status === 'results' && <><div className="online-true-order"><span className="online-label">TRUE ORDER · LOWEST TO HIGHEST</span><div>{actual.map((card) => <span key={card.id}>{card.clue}<b>{card.value}</b></span>)}</div></div>{me?.isHost && <div className="online-actions"><button className="button button-primary" disabled={busy} onClick={() => void mutate('next')}>Return to lobby →</button></div>}</>}</>}
      </section>}
      {error && <p className="online-error" role="alert">{error}</p>}
    </main>
    <footer className="site-footer"><span>GOOD CONVERSATIONS, NOW ONLINE</span><span>PRIVATE NUMBERS · SHARED PERSPECTIVES</span></footer>
  </div>;
}
