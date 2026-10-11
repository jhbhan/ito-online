import type { OnlineSession, OnlineSnapshot } from './types';

type Action = 'create' | 'join' | 'snapshot' | 'settings' | 'start' | 'clue' | 'sorting' | 'reorder' | 'lock' | 'reveal' | 'next' | 'leave';
export async function gameRequest<T>(action: Action, body: Record<string, unknown> = {}, session?: OnlineSession): Promise<T> {
  const response = await fetch('/api/game', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...(session ? { roomId: session.roomId, token: session.token } : {}), ...body }),
  });
  let result: Record<string, unknown>;
  try { result = await response.json() as Record<string, unknown>; }
  catch { throw new Error('The online server is unavailable. Use Netlify Dev locally or check the deployment.'); }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed.');
  return result as T;
}
export const onlineSessionKey = 'ito-online-session-v1';
export function loadSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(onlineSessionKey);
    const value = raw ? JSON.parse(raw) as Partial<OnlineSession> : null;
    return value && typeof value.roomId === 'string' && typeof value.token === 'string' && typeof value.code === 'string' ? value as OnlineSession : null;
  } catch { return null; }
}
export function saveSession(session: OnlineSession | null) {
  try {
    if (session) localStorage.setItem(onlineSessionKey, JSON.stringify(session));
    else localStorage.removeItem(onlineSessionKey);
  } catch { /* Private mode may disable storage; this tab can still play. */ }
}
export type MutationResult = OnlineSnapshot;
