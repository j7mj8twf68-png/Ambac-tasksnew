# AMBAC Materials Task Manager

## Quick Start

1. Set up Supabase (see instructions below)
2. Copy `.env.example` to `.env.local` and fill in your credentials
3. Run:
```
npm install
npm run dev
```

## Supabase Setup

1. Go to supabase.com → create account → New Project
2. Open SQL Editor → New Query → paste contents of `supabase/schema.sql` → Run
3. Go to Project Settings → API → copy Project URL and anon key
4. Add to `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

## Deploy to Vercel

1. Push to GitHub or drag folder to vercel.com/new
2. Add environment variables in Vercel dashboard (same as .env.local)
3. Deploy → share URL with your team

## Default PINs
- Manager: 0000
- Alex R.: 1111
- Jordan M. (Lead): 2222
- Casey T.: 3333
- Sam K.: 4444
