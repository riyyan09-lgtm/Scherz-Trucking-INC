# Launch Task — Get Scherz Trucking INC Live Today

Read `CLAUDE.md` first for project context. This file is today's one-time
checklist, not permanent memory — work through it in order, verify each step
before moving to the next, and don't declare anything "done" without actually
checking it.

## Before you start: get these from the human first

Stop and ask for whatever isn't already available as an environment variable
or already stated in chat. Do not invent placeholder values for any of these
and proceed as if they were real:

- [ ] A Supabase project connection string (Project Settings → Database →
      **Connection Pooling** tab, not "Direct connection")
- [ ] A GitHub account/repo to push to, or permission to create one
- [ ] Vercel account access (CLI token, or confirm the human will do the
      dashboard import step manually)
- [ ] A domain name, only if connecting one today — otherwise the free
      `*.vercel.app` URL counts as "live" for now
- [ ] A Resend API key + notification email, if they want lead alerts today
      (optional — skip if not provided, don't block on it)

## Step 1 — Database

1. Get `DATABASE_URL` from the human if not already set.
2. Run, in this exact order: `schema.sql`, then `seed.sql`, then
   `seed-data.sql`.
3. Verify: `select count(*) from pages;` should return 500. If it doesn't,
   stop and debug before moving on — don't proceed with an empty database.

## Step 2 — Local build check

1. `npm install`
2. Copy `.env.example` to `.env.local`, fill in the real `DATABASE_URL`.
3. `npm run build` — must succeed with zero errors. If `generateStaticParams`
   or any DB call fails here, check the graceful-degradation pattern
   documented in `CLAUDE.md` is intact.
4. `npm run dev`, manually check `/car-shipping/tx/houston` renders real
   content (not a 404) before moving on.

## Step 3 — Push to GitHub

1. `git init` if needed (`.gitignore` is already present, don't overwrite it).
2. Commit, then push to the repo the human specified. Default to a **private**
   repo if they haven't stated a preference — ask before making it public.

## Step 4 — Deploy to Vercel

1. Use the `vercel` CLI if authenticated; otherwise tell the human exactly
   what to click in the dashboard rather than guessing.
2. Set environment variables in Vercel to match `.env.local`.
3. Confirm the build succeeds on Vercel's side too (not just locally) and
   note the live URL.

## Step 5 — Domain (only if the human has one ready today)

Add it under Vercel → Settings → Domains, then hand the human the exact DNS
records to add at their registrar. This step requires their action — don't
attempt to guess or skip it silently.

## Step 6 — End-to-end verification (do not skip)

- [ ] `<live-url>/car-shipping/tx/houston` renders real content
- [ ] Submit the quote form with test data
- [ ] `select * from leads order by created_at desc limit 1;` shows the new
      row with the correct `routing_mode`
- [ ] If Resend was configured, confirm the notification email actually
      arrived
- [ ] `<live-url>/admin` loads and signs in with the placeholder passcode

## Report back

Tell the human plainly: what's live and at what URL, what you personally
verified end-to-end (not just "should work"), and what still needs their
action — domain DNS propagation, replacing the admin passcode with real
auth, anything you had to skip because a credential wasn't provided.
