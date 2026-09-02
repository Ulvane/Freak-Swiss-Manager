# Freak Swiss Manager

## Swiss Manager K Edition

**Freak Swiss Manager** is a free, source-visible control desk for Swiss chess
tournaments. The short name is **Freak Swiss**; the edition name is **Swiss
Manager K Edition**.

- Live application: Cloudflare deployment in progress
- Public source: [github.com/Ulvane/Freak-Swiss-Manager](https://github.com/Ulvane/Freak-Swiss-Manager)
- Project statement: [PROTEST.md](PROTEST.md)


## What it does

- Creates Swiss tournaments with three to fifteen rounds.
- Registers players by a six-character tournament code.
- Requires player check-in before Round 1.
- Generates deterministic Swiss pairings with pairing-history safeguards.
- Records results as `1-0`, `0-1` or draw.
- Shows current and archived rounds, board numbers, scores and standings.
- Supports withdrawals, one-round skips and manual one-point byes.
- Delegates one tournament at a time through single-use moderator tokens.
- Keeps a superadmin-only token and account ledger.

## Roles and permissions

| Capability | Superadmin | Assigned moderator | Player |
| --- | --- | --- | --- |
| Create or delete tournaments | Yes | No | No |
| Manage an assigned tournament | All tournaments | Assigned tournament only | No |
| Add, remove and check in players | Yes | Assigned tournament only | No |
| Generate or delete the latest round | Yes | Assigned tournament only | No |
| Record current-round results | Yes | Assigned tournament only | No |
| Invite another tournament moderator | Yes | Assigned tournament only | No |
| Delete moderators, accounts or token records | Yes | No | No |
| Register, view pairings and standings | Yes | Yes | Yes |

Permissions are enforced by the server. Hiding a button in the interface is
not treated as authorization.

## How this was made

This is a fully AI-written, vibe-coded project. The project maintainer defines
the product, requirements, visual direction and tests, while AI writes the
implementation. The maintainer does not intend to write the application code
manually.

## Planned work

- FIDE rating history and progress charts
- Official rating-change estimates using the current FIDE rules
- Separate Standard, Rapid and Blitz rating records
- Broader moderator-role and public-registration testing
- Additional pairing audit fixtures

Planned features are intentionally listed here instead of being presented as
finished functionality.

## Technology

- Next.js-compatible Vinext application
- React and TypeScript
- Cloudflare Worker runtime
- Cloudflare D1-compatible SQLite storage
- Native Freak Swiss accounts with salted password hashes and expiring sessions

## Development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm run install:ci
npm run dev
```

Validation:

```bash
npm run lint
npm run build
npm test
```

### Cloudflare setup

The production application uses a Cloudflare Worker and a D1 database bound as
`DB`.

1. Create a D1 database named `freak-swiss-db`.
2. Copy `wrangler.example.jsonc` to `wrangler.jsonc` and replace the database ID.
3. In Cloudflare Workers Builds, use `npm run build` as the build command and
   `npm run deploy` as the deploy command.
4. Keep `main` as the production branch and the repository root as the root
   directory.

The deploy command applies every unapplied migration in `drizzle/` before
publishing the new Worker version.

Set the runtime variables `SUPERADMIN_EMAIL` and `SUPERADMIN_SETUP_SECRET`
before creating the superadmin account. The configured email is reserved for
that account. The setup secret is required only for its first registration and
must never be committed.

Never commit passwords, setup secrets, moderator tokens or live account data.

## Protest

Freak Swiss Manager is for informal, unrated coffee-shop, club, friend and
community tournaments. It is not intended for official FIDE-rated events.

Pairing a small chess tournament should be free. This project protests anyone
who charges money merely for pairing players or running basic tournament
functions.

Use it and share it without paying for basic pairing.

No license has been granted yet. The source is publicly viewable, but reuse
rights remain reserved until a license is added.
