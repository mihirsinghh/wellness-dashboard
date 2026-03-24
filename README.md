# Wellness Dashboard

A Vite + React wellness dashboard for habits, tasks, expenses, and journaling.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production build outputs to `dist/`.

## Cross-device sync with Supabase

The app can run in two modes:

- Local-only mode when Supabase environment variables are not configured
- Cloud-sync mode when Supabase is configured and the user signs in

### 1. Create a Supabase project

Create a new project in [Supabase](https://supabase.com/).

### 2. Create the sync table

Run the SQL in [`supabase/setup.sql`](./supabase/setup.sql) inside the Supabase SQL editor.

This creates a `user_dashboard_state` table with row-level security so each signed-in user can only access their own data.

### 3. Add environment variables

Copy [`.env.example`](./.env.example) to `.env` locally and fill in:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Enable auth

Enable Email auth in Supabase Auth settings. The app uses email + password sign-in.

### 5. Add the same environment variables to Vercel

In Vercel Project Settings, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then redeploy the app.

## Deploy on Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Vercel should detect the app as a Vite project automatically.
4. Confirm these settings if prompted:

- Build Command: `npm run build`
- Output Directory: `dist`

After the environment variables are set, the deployed app will show sign-in and sync data across devices for the same account.
