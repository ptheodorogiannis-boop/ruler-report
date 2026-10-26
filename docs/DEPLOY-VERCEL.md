# Deploying to Vercel with a Neon Postgres database

The app runs on Vercel with a hosted Postgres database from Neon. Local development and Docker keep using SQLite: `npm run build` looks at `DATABASE_URL` and picks the path by itself (`scripts/build.mjs`).

## What changes on Vercel

| Area | On Vercel | Elsewhere |
|---|---|---|
| Database | Postgres from `DATABASE_URL`; the build writes `prisma/postgres/schema.prisma` from `prisma/schema.prisma` and applies it | SQLite file |
| Schema changes | Applied by every build with `prisma db push`; a change that would drop data stops the build | `npm run setup` / `prisma db push` |
| Uploaded images | Stored in the database (`MEDIA_STORE=db`), up to 4 MB each | `data/uploads` on disk, up to 5 MB |
| Automations, goals, health checks | A Vercel cron calls `/api/cron/tick` once a day at 06:00 UTC (`vercel.json`) | In-process scheduler |
| PDF export | Off (no Chromium in Vercel functions); the PDF menu is hidden | Chromium through Playwright |
| Links in e-mails and the API docs | The project's production address, unless `APP_URL` is set | `APP_URL` |

Each default can be overridden with its own variable: `MEDIA_STORE=db|disk`, `ENABLE_SCHEDULER=0|1`, `PDF_ENABLED=off|auto`.

## Set up

1. **Add the database.** In the Vercel project, open **Storage**, create a **Neon** Postgres database and connect it to the project for Production, Preview and Development. This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct), which the build uses.
2. **Add the settings** under **Settings → Environment Variables**:
   - `APP_SECRET`: 32 or more random characters. Use the same value for Production and Preview, because preview databases copy encrypted credentials. One way to make one:

     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```
   - `CRON_SECRET`: 16 or more random characters. Vercel sends it with each cron call, and the tick route refuses calls without it.
   - `SEED_DEMO=1`, optional: loads the demo agency (six sample clients) on a build that finds the database empty. It signs in as `admin@demo.local` / `demo1234`, so change that password after the first sign-in, or delete the user. Remove the variable afterwards.
   - `ANTHROPIC_API_KEY`, optional: AI analysis and Ask. Without it the app uses its rule-based analyst.
   - `APP_URL`, optional: only when the site should link to an address other than the project's production domain.
   - Confirm that **Automatically expose System Environment Variables** is ticked on the same page. The Vercel defaults in the table above depend on `VERCEL=1`, which Vercel sets only when this is ticked. Without it, uploads try to write to a disk Vercel discards.
3. **Redeploy** from **Deployments**, because settings only apply to new deployments.
4. **Sign in.** With `SEED_DEMO=1`, use the demo login. Otherwise create a workspace at `/signup`.

## Good to know

- **Sign-up is open:** anyone who can open the site can create a workspace at `/signup`. Vercel's Deployment Protection settings can limit who can open it.
- **The Hobby plan runs cron jobs at most once a day,** and an hourly schedule fails the deployment there. On Pro, an hourly tick is `"schedule": "0 * * * *"` in `vercel.json`. Any outside scheduler can also call `GET /api/cron/tick` with the header `Authorization: Bearer <CRON_SECRET>`.
- **A missing database stops the build.** A deployment without a Postgres `DATABASE_URL` or `APP_SECRET` stops with a message that names what is missing.
- **A sleeping database can time out.** Neon's free databases sleep when idle. If a build or the first request fails with `P1001: Can't reach database server`, add `connect_timeout=15` to the connection string, as Neon's Prisma guide suggests.
- **Checking the Postgres path locally:** point `DATABASE_URL` at a Postgres database (in `.env` or the shell), set `APP_SECRET`, and run `npm run build`. The generated `prisma/postgres/` folder is not committed. Run `npx prisma generate` afterwards to go back to the SQLite client.
