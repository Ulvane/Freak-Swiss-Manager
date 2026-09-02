import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull().default(""),
    rounds: integer("rounds").notNull(),
    joinCode: text("join_code"),
    registrationOpen: integer("registration_open", { mode: "boolean" })
      .notNull()
      .default(true),
    currentRound: integer("current_round").notNull().default(0),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("tournaments_owner_idx").on(table.ownerEmail),
    index("tournaments_created_idx").on(table.createdAt),
    uniqueIndex("tournaments_join_code_unique").on(table.joinCode),
  ],
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fideId: text("fide_id").notNull().default(""),
    accountEmail: text("account_email"),
    rating: integer("rating").notNull().default(0),
    seed: integer("seed").notNull(),
    withdrawn: integer("withdrawn", { mode: "boolean" }).notNull().default(false),
    checkedIn: integer("checked_in", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("players_tournament_idx").on(table.tournamentId),
    index("players_account_idx").on(table.accountEmail),
    uniqueIndex("players_account_tournament_unique").on(
      table.tournamentId,
      table.accountEmail,
    ),
    uniqueIndex("players_seed_unique").on(table.tournamentId, table.seed),
  ],
);

export const userAccounts = sqliteTable(
  "user_accounts",
  {
    email: text("email").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [index("user_accounts_last_seen_idx").on(table.lastSeenAt)],
);

export const authCredentials = sqliteTable(
  "auth_credentials",
  {
    email: text("email")
      .primaryKey()
      .references(() => userAccounts.email, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("auth_credentials_updated_idx").on(table.updatedAt)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email")
      .notNull()
      .references(() => userAccounts.email, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("auth_sessions_email_idx").on(table.email),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const moderators = sqliteTable(
  "moderators",
  {
    email: text("email").primaryKey(),
    displayName: text("display_name").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("moderators_created_idx").on(table.createdAt)],
);

export const tournamentModerators = sqliteTable(
  "tournament_moderators",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    moderatorEmail: text("moderator_email").notNull(),
    assignedByEmail: text("assigned_by_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("tournament_moderators_tournament_idx").on(table.tournamentId),
    index("tournament_moderators_email_idx").on(table.moderatorEmail),
    uniqueIndex("tournament_moderators_unique").on(
      table.tournamentId,
      table.moderatorEmail,
    ),
  ],
);

export const moderatorTokens = sqliteTable(
  "moderator_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint"),
    tournamentId: text("tournament_id").references(() => tournaments.id, {
      onDelete: "cascade",
    }),
    createdByEmail: text("created_by_email").notNull(),
    usedByEmail: text("used_by_email"),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
    revokedByEmail: text("revoked_by_email"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("moderator_tokens_hash_unique").on(table.tokenHash),
    index("moderator_tokens_tournament_idx").on(table.tournamentId),
    index("moderator_tokens_expiry_idx").on(table.expiresAt),
    index("moderator_tokens_created_idx").on(table.createdAt),
  ],
);

export const playerRoundStatuses = sqliteTable(
  "player_round_statuses",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("player_round_statuses_tournament_idx").on(table.tournamentId),
    uniqueIndex("player_round_statuses_player_round_unique").on(
      table.tournamentId,
      table.playerId,
      table.roundNumber,
    ),
  ],
);

export const rounds = sqliteTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("rounds_tournament_number_unique").on(
      table.tournamentId,
      table.number,
    ),
  ],
);

export const pairings = sqliteTable(
  "pairings",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    boardNumber: integer("board_number").notNull(),
    whitePlayerId: text("white_player_id").references(() => players.id),
    blackPlayerId: text("black_player_id").references(() => players.id),
    result: text("result").notNull().default("*"),
  },
  (table) => [
    index("pairings_tournament_idx").on(table.tournamentId),
    index("pairings_round_idx").on(table.roundId),
    uniqueIndex("pairings_board_unique").on(
      table.tournamentId,
      table.roundNumber,
      table.boardNumber,
    ),
  ],
);
