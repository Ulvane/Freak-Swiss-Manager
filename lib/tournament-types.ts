export type ResultCode =
  | "*"
  | "1-0"
  | "0-1"
  | "½-½"
  | "1-BYE"
  | "1F-0F"
  | "0F-1F"
  | "0F-0F";

export type TournamentVisibility = "official" | "community" | "private";

export type Tournament = {
  id: string;
  name: string;
  city: string;
  rounds: number;
  joinCode: string | null;
  registrationOpen: boolean;
  visibility: TournamentVisibility;
  archivedAt: string | null;
  playerLimit: number | null;
  currentRound: number;
  status: string;
  createdAt: string;
};

export type TournamentSummary = Tournament & {
  playerCount: number;
  hasJoined?: boolean;
  role: "superadmin" | "moderator" | "organizer" | "player" | "visitor";
};

export type Player = {
  id: string;
  name: string;
  fideId?: string;
  rating: number;
  seed: number;
  withdrawn: boolean;
  withdrawnFromRound: number | null;
  checkedIn: boolean;
  nextRoundStatus: "active" | "skip" | "bye";
  isYou: boolean;
};

export type RoundStatusRecord = {
  playerId: string;
  roundNumber: number;
  status: "skip" | "bye";
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
  isSuperadmin: boolean;
  isBanned: boolean;
  banReason: string | null;
};

export type GuestSummary = {
  playerId: string;
  tournamentId: string;
  tournamentName: string;
  name: string;
  fideId?: string;
  rating: number;
  withdrawn: boolean;
  guestExpiresAt: string | null;
  guestTokenHint: string | null;
  createdAt: string;
};

export type PublicStaffSummary = {
  displayName: string;
  role: "superadmin" | "moderator";
};

export type ModeratorTokenSummary = {
  id: string;
  tokenHint: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  targetEmail: string | null;
  targetName: string | null;
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

export type ModerationAuditSummary = {
  id: string;
  actorEmail: string;
  actorName: string | null;
  action: string;
  targetEmail: string | null;
  targetName: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  detail: string | null;
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
  roundStatuses: RoundStatusRecord[];
  standings: Standing[];
  canEdit: boolean;
  canDeleteTournament: boolean;
  canDeleteRound: boolean;
  canInviteModerators: boolean;
  canRemoveModerators: boolean;
  organizerName: string | null;
  canJoinDelegation: boolean;
  canLeaveDelegation: boolean;
  canManageCheckIn: boolean;
  canChangeVisibility: boolean;
  canArchiveTournament: boolean;
  canSelfWithdraw: boolean;
  canJoin: boolean;
  viewerRole: "superadmin" | "moderator" | "organizer" | "player" | "visitor";
  moderators: ModeratorSummary[];
};

export type ManagerPayload = {
  serverTime: string;
  authenticated: boolean;
  viewerName: string | null;
  viewerEmail: string | null;
  viewerGlobalRole: "superadmin" | "moderator" | "organizer" | "player" | "visitor";
  canCreateTournament: boolean;
  canCreateOfficialTournaments: boolean;
  tournaments: TournamentSummary[];
  communityTournaments: TournamentSummary[];
  openTournaments: TournamentSummary[];
  archivedOfficialTournaments: TournamentSummary[];
  archivedCommunityTournaments: TournamentSummary[];
  snapshot: TournamentSnapshot | null;
  accounts: AccountSummary[];
  moderators: ModeratorSummary[];
  moderatorTokens: ModeratorTokenSummary[];
  guests: GuestSummary[];
  moderationAuditLog: ModerationAuditSummary[];
  publicStaff: PublicStaffSummary[];
  canRedeemModeratorToken: boolean;
};
