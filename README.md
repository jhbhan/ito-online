# ito online

React + TypeScript frontend on Netlify, Netlify Functions for room actions, and Supabase Postgres for persistent games and private number cards. The previous single-device game remains at `/game/setup`; the online lobby is the home page.

## Set up Supabase

1. Create a Supabase project.
2. Run the SQL files in [`supabase/migrations/`](supabase/migrations/) in filename order in the Supabase SQL Editor, or apply them with a linked Supabase CLI project. Existing projects must also run `202610110002_close_rooms.sql` to enable room closing.
3. Copy the project URL and **service role key** into Netlify environment variables named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Give them Functions scope. Never put the service role key in a `VITE_` variable or frontend code.

The service role key is used only by Netlify Functions. Tables have row-level security enabled with no browser-facing policies. The online API checks a random token held by each player and sends each player only their own secret numbers until reveal.

## Run locally

```sh
npm install
cp .env.example .env
# Fill in the two environment variables in .env.
npm run dev:online
```

Open the URL printed by Netlify Dev. Plain `npm run dev` serves the React frontend but does not serve `/api/game`; it is useful for the single-device route only.

`npm run build` checks the frontend and functions, then builds `dist/`. `netlify functions:build` also checks Netlify packaging. The migration requires a real Supabase database to apply and validate.

## Online game flow

1. Moderator creates a room and receives a four-letter code and join link.
2. Players join the lobby with their names. The creator is also a player.
3. Moderator chooses the prompt, scale labels, and 1–5 number cards per player.
4. Starting a round assigns unique 0–100 values. Each player sees only their own values and can edit one clue per card.
5. Once all clues are submitted, the moderator starts sorting. The shared board updates for every player.
6. Moderator locks the order and reveals one card at a time. Only revealed values become public.
7. The final screen shows the submitted and actual order. The group can return to the lobby for another round.

The moderator can close the room at any point. Connected players see a closed-room message; the round cards and private numbers are removed immediately. Closed rooms are cleaned up after 24 hours.

The frontend polls for room changes every 2.5 seconds and refreshes on tab focus. Rooms expire after 24 hours; a daily Netlify scheduled function removes expired rooms and old join attempts.

## Structure

- `src/online/` — online room UI and API client
- `netlify/functions/game.mts` — secure room API
- `netlify/functions/cleanup.mts` — daily expiry cleanup
- `supabase/migrations/` — tables and atomic round operations
- `src/domain/` and `src/features/` — original single-device mode

The online frontend uses only same-origin requests to `/api/game`. It needs no public Supabase key.

Supabase and Netlify setup references: [Netlify Functions](https://docs.netlify.com/build/functions/get-started/), [Netlify environment variables](https://docs.netlify.com/build/functions/environment-variables/), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
