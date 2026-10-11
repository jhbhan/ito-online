# Architecture

## Online mode

The React app at `/online` calls the same-origin Netlify Function at `/api/game`. The function uses Supabase's service role key on the server only. Browsers receive a random 32-byte player token when creating or joining a room and store it locally for reconnects. The database stores only its SHA-256 hash.

The four-letter code finds an open lobby. It does not authorize moderator actions. Every operation checks room membership using the token hash, and host operations check the room's `host_player_id`.

Supabase stores rooms, players, rounds, clue cards, private card values, and join-attempt limits. Row-level security is enabled on every table with no direct browser policies. Critical transitions happen in database functions with row locks, so a double click cannot skip reveal steps.

The client polls every 2.5 seconds and refreshes on tab focus. On each request the server constructs a new snapshot. In clue entry, all players see submission status; only the owner sees their clue and number. During sorting, clue text is shared while numbers remain private. During reveal, each card's value becomes public in locked order. The moderator is a normal player who also controls room transitions.

The daily cleanup function deletes expired rooms and old join attempts. Rooms expire 24 hours after the last round action. A token can reconnect from the same browser until room expiry. Clearing local browser storage loses the token; recovery and host transfer are future features.

## Single-device mode

The original app remains at `/game/setup`. Its domain reducer and local repository are separate from the online game. Prompt JSON and visual styles are shared. Online game state and number privacy are enforced on the server; the local mode uses browser storage and does not make network requests.

## Key files

- `src/online/`: room screens, private clue cards, shared board, and polling API client.
- `netlify/functions/game.mts`: room creation, join, snapshots, clue saves, settings, and transitions.
- `netlify/functions/cleanup.mts`: expired room cleanup.
- `supabase/migrations/202610110001_online_rooms.sql`: data tables and transactional operations.
- `src/domain/`, `src/features/`, `src/state/`: original single-device game.
