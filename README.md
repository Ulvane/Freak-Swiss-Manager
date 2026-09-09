# Freak Swiss Manager

## Swiss Manager K Edition

**Freak Swiss Manager** is a free, source-visible control desk for Swiss chess
tournaments. The short name is **Freak Swiss**; the edition name is **Swiss
Manager K Edition**.

- Live application: [freak-swiss-manager.ulvane.workers.dev](https://freak-swiss-manager.ulvane.workers.dev/)
- Public source: [github.com/Ulvane/Freak-Swiss-Manager](https://github.com/Ulvane/Freak-Swiss-Manager)
- Project statement: [PROTEST.md](PROTEST.md)

## What it does

- Creates Swiss tournaments with three to fifteen rounds.
- Registers players without an account by a six-character tournament code and
  a private browser session.
- Supports temporary guest roster entries that expire after three days unless
  Round 1 has started.
- Requires player check-in before Round 1.
- Generates deterministic Swiss pairings with pairing-history safeguards.
- Records results as `1-0`, `0-1` or draw.
- Shows current and archived rounds, board numbers, scores, standings and a
  round-by-round crosstable.
- Prints pairings, results, standings and crosstables using an A4-friendly view.
- Supports withdrawals, one-round skips and manual one-point byes.
- Allows tournament staff to add checked-in late entrants between completed rounds.
- Delegates one tournament at a time through single-use moderator tokens.
- Keeps a superadmin account and an auditable moderator-token ledger.
- Downloads a complete JSON tournament backup without credentials, session tokens
  or password data.

## Roles and permissions

| Capability | Superadmin | Approved/assigned moderator | Tournament owner | Player/guest |
| --- | --- | --- | --- | --- |
| Create tournaments | Yes | Yes | Yes | No |
| Publish an official listing | Yes | Yes | No | No |
| Manage a tournament | All tournaments | Assigned tournament only | Owned tournament only | No |
| Add, remove and check in players | Yes | Assigned tournament only | Owned tournament only | No |
| Generate/delete latest round and record results | Yes | Assigned tournament only | Owned tournament only | No |
| Invite another tournament moderator | Yes | Assigned tournament only | Owned tournament only | No |
| Delete moderators, accounts or tournaments | Yes | No | No | No |
| Join, view pairings/standings/crosstable | Yes | Yes | Yes | Yes |
| Self-withdraw while preserving history | Yes | Yes | Yes | Yes |

Official tournaments appear in the main listing. Ordinary owner-created events
default to the separate Community Tournaments listing, and private events are
available only by link or code. Owner-issued moderator invitations grant access
only to that tournament and never create site-wide moderator privileges.

Permissions are enforced by the server. Hiding a button in the interface is
not treated as authorization.

## How this was made

This is a fully AI-written, vibe-coded project. The project maintainer defines
the product, requirements, visual direction and tests, while AI writes the
implementation. The maintainer does not intend to write the application code
manually.

For who wants to know more I used claude opus 4.6, antigravity mostly gemini 3.1 pro and 3.8 flash, gpt 5.6 sol and gpt 6 astra and I used all of em at highest or high. That's all I just wrote prompts.

## Planned work

- FIDE rating history and progress charts
- Official rating-change estimates using the current FIDE rules
- Separate Standard, Rapid and Blitz rating records
- Additional pairing audit fixtures

Planned features are intentionally listed here instead of being presented as finished functionality.

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

For the abandoned, empty two-table prototype database only, the tracked
`scripts/database/repair-empty-legacy-schema.sql` prerequisite preserves its
original tables under `legacy_empty_*` names before the numbered migrations.
It refuses nonempty tables. Do not run this prerequisite on an initialized
database. Migration `0008_odd_lord_tyger` and existing guest tokens are retained;
`0009_tiresome_demogoblin` adds organizer visibility, archive state, browser
player sessions, and the withdrawal starting round without deleting records.

The original `/guest/join` page and guest access tokens remain supported.
New "Join with code" registrations use an HttpOnly browser cookie; both flows
keep withdrawal separate from a one-round skip and preserve historical games.

Register the intended account first, then set the runtime variable
`SUPERADMIN_EMAIL` to that account's exact email address. Superadmin access is
granted whenever the signed-in email matches this Cloudflare variable. Public
registration does not verify email ownership. Verify the intended person's
identity before granting a role. Once configured, the superadmin address cannot
be created through public signup. Existing identities, including legacy records
without password credentials, cannot be reclaimed by registering their email.

Upgrades from the earlier 210,000-iteration password build remove only those
incompatible password records. If that affected an account, public registration
is no longer an account-recovery method. The site operator must verify ownership
and restore credentials through a trusted administrative process. Do not delete
the account or its role/ownership records to work around the registration guard.

## Security changes (September 2026)

Deploy migration `0012_roster_security_guards.sql` before the updated Worker.
It enforces roster capacity atomically for new entries across both guest registration
endpoints; it preserves existing data. The normal `npm run deploy` migration step
applies it automatically.

The Worker now requires the three `ratelimits` bindings in `wrangler.jsonc`.
They limit authentication to 60 requests/minute, other writes to 300/minute and
API reads to 1,200/minute per connecting IP, per Cloudflare location. These are
abuse limits, not billing caps. Shared tournament Wi-Fi may need adjusted limits.
The database separately enforces seven login attempts before a 15-minute lockout,
including simultaneous attempts. JSON request bodies are capped at 64 KiB.

Browser mutations require a matching origin and JSON content type, except the
same-origin logout form. Logout uses POST; API GET requests never sign users out.
Sensitive responses are marked private/no-store. Framing is disabled, and return
URLs are normalized to paths on this site.

The security dependency refresh includes Next.js 16.3.4, React 19.2.8 and Vinext
1.0.0-beta.9 (which removes the vulnerable image-size dependency). The scoped
esbuild override patches Drizzle's legacy loader; the Sharp 0.35.4 override
patches Miniflare's pinned image dependency. Keep the lockfile committed and
run `npm audit`, `npm run lint` and `npm test` when updating these dependencies.

Private tournaments are unlisted, not restricted to authenticated members: a
holder of the link or join code can access them. This is the existing product
behavior. Do not use those links to store confidential player information.

Never commit passwords, setup secrets, moderator tokens or live account data.

## Protest

Freak Swiss Manager is for informal, unrated coffee-shop, club, friend and
community tournaments. It is not intended for official FIDE-rated events.

Pairing a small chess tournament should be free. I protest anyone who charges
money merely for pairing players or running basic tournament functions. I do
not respect anyone who does that. I also protest those who have written this
basic task using AI or vibe coding but still demand unnecessary money from
people. Use it and share it without paying for basic pairing.

### Türkçe — Protesto

Freak Swiss Manager; gayriresmî, ratingsiz kafe, kulüp, arkadaş ve topluluk
turnuvaları içindir. Resmî FIDE reytingli turnuvalar için tasarlanmamıştır.

Küçük bir satranç turnuvasındaki eşleştirmeler ücretsiz olmalıdır. Sadece
oyuncuları eşleştirmek veya temel turnuva işlevlerini sunmak için para talep
eden herkesi protesto ediyorum. Bunu yapan hiç kimseye saygı duymuyorum.

Ayrıca, bu temel işi yapay zekâ veya “vibe coding” kullanarak yazıp yine de
insanlardan gereksiz yere para talep edenleri de protesto ediyorum.

Temel eşleştirme için ödeme yapmadan kullanın ve paylaşın.

No license has been granted yet. The source is publicly viewable, but reuse
rights remain reserved until a license is added.
