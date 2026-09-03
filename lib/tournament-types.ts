export type ResultCode =
  | "*"
  | "1-0"
  | "0-1"
  | "½-½"
  | "1-BYE"
  | "1F-0F"
  | "0F-1F"
  | "0F-0F";

export type Tournament = {
  id: string;
  name: string;
  city: string;
  rounds: number;
  visibility: "FEATURED" | "COMMUNITY" | "PRIVATE";
  joinCode: string | null;
  registrationOpen: boolean;
  currentRound: number;
  status: string;
  createdAt: string;
};

export type TournamentSummary = Tournament & {
  playerCount: number;
  role: "superadmin" | "moderator" | "tournament_owner" | "player" | "visitor";
};

export type Player = {
  id: string;
  name: string;
  fideId: string;
  rating: number;
  seed: number;
  withdrawn: boolean;
  checkedIn: boolean;
  nextRoundStatus: "active" | "skip" | "bye";
  isYou: boolean;
};

export type ModeratorSummary = {
  email: string;
  displayName: string;
  createdAt: string;
  tournamentCount: number;
};

export type AccountSummary = {
  email: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
  isModerator: boolean;
};

export type ModeratorTokenSummary = {
  id: string;
  tokenHint: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  createdByEmail: string;
  createdByName: string | null;
  usedByEmail: string | null;
  usedByName: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
};

export type Pairing = {
  id: string;
  roundNumber: number;
  boardNumber: number;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  result: ResultCode;
  whiteName: string | null;
  blackName: string | null;
};

export type Standing = {
  rank: number;
  playerId: string;
  name: string;
  rating: number;
  score: number;
  buchholz: number;
  sonnebornBerger: number;
};

export type TournamentSnapshot = {
  tournament: Tournament;
  players: Player[];
  pairings: Pairing[];
  standings: Standing[];
  canEdit: boolean;
  canDeleteTournament: boolean;
  canDeleteRound: boolean;
  canInviteModerators: boolean;
  canRemoveModerators: boolean;
  canManageCheckIn: boolean;
  canJoin: boolean;
  canWithdraw: boolean;
  viewerRole: "superadmin" | "moderator" | "tournament_owner" | "player" | "visitor";
  moderators: ModeratorSummary[];
};

export type ManagerPayload = {
  serverTime: string;
  authenticated: boolean;
  viewerName: string | null;
  viewerEmail: string | null;
  viewerGlobalRole: "superadmin" | "moderator" | "player" | "visitor";
  canCreateTournament: boolean;
  tournaments: TournamentSummary[];
  openTournaments: TournamentSummary[];
  snapshot: TournamentSnapshot | null;
  accounts: AccountSummary[];
  moderators: ModeratorSummary[];
  moderatorTokens: ModeratorTokenSummary[];
};
