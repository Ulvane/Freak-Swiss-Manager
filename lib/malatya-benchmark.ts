import {
  createSwissPairings,
  hydratePairingPlayers,
} from "@/lib/pairing-engine";
import type { ResultCode } from "@/lib/tournament-types";

export const MALATYA_SOURCE_URL =
  "https://s2.chess-results.com/tnr1482445.aspx?lan=8&art=0&flag=30&SNode=S0";

export const MALATYA_EVENT = {
  name: "9th Malatya Golden Apricot International Open Chess Tournament — A",
  rounds: 9,
  playerCount: 67,
  officialUpdate: "29 August 2026, 14:34:38",
} as const;

export type BenchmarkPlayer = {
  seed: number;
  name: string;
  rating: number;
};

export type OfficialBenchmarkPairing = {
  board: number;
  whiteSeed: number;
  blackSeed: number | null;
  result: ResultCode;
};

export const MALATYA_PLAYERS: BenchmarkPlayer[] = [
  { seed: 1, name: "POUR AGHA BALA, AMİRREZA", rating: 2449 },
  { seed: 2, name: "STOPA, JACEK", rating: 2359 },
  { seed: 3, name: "NİGALİDZE, GAİOZ", rating: 2354 },
  { seed: 4, name: "MAMMADOV, SADİG", rating: 2315 },
  { seed: 5, name: "NİKOOKAR, MAHDİ", rating: 2305 },
  { seed: 6, name: "ALAGHEHMAND, ARSHİA", rating: 2297 },
  { seed: 7, name: "KHALESİ, VAHİD", rating: 2226 },
  { seed: 8, name: "ODEEV, HANDSZAR", rating: 2203 },
  { seed: 9, name: "CHKHAİDZE, NİKOLOZ", rating: 2196 },
  { seed: 10, name: "SADATNAJAFİ, SEYEDMOHAMMAD", rating: 2194 },
  { seed: 11, name: "GOLSHAANİ, TAHA", rating: 2186 },
  { seed: 12, name: "ASGARİ, MORTEZA", rating: 2158 },
  { seed: 13, name: "YAYİK, MUSTAFA", rating: 2138 },
  { seed: 14, name: "PRİMBETOV, KAZBEK", rating: 2132 },
  { seed: 15, name: "SMİRNOVA, EKATERİNA", rating: 2132 },
  { seed: 16, name: "MOHANNAD, FARHAN", rating: 2106 },
  { seed: 17, name: "AZİMOV, YASİN", rating: 2041 },
  { seed: 18, name: "ZEYNALİ, ALİ", rating: 2031 },
  { seed: 19, name: "DOOSTKAM, POUYAN", rating: 1969 },
  { seed: 20, name: "CHALADZE, GİORGİ", rating: 1968 },
  { seed: 21, name: "SEYİDLİ, MİRSALEH", rating: 1959 },
  { seed: 22, name: "UZGUR, ARDA", rating: 1955 },
  { seed: 23, name: "TAAVONİ, RAHİM", rating: 1952 },
  { seed: 24, name: "MAHMOODY, MOHAMMAD SADEGH", rating: 1938 },
  { seed: 25, name: "BİNGÜL, MURATCAN", rating: 1916 },
  { seed: 26, name: "DEMİRTAŞ, HAFİZE", rating: 1906 },
  { seed: 27, name: "DÜLGER, BATUHAN İHSAN", rating: 1904 },
  { seed: 28, name: "HARMANŞA, KAĞAN", rating: 1903 },
  { seed: 29, name: "ŞAHİN, ARDA", rating: 1903 },
  { seed: 30, name: "YORKAN, AHMET SELİM", rating: 1902 },
  { seed: 31, name: "ÇİÇEK, CEMİL", rating: 1894 },
  { seed: 32, name: "KILIÇ, NURULLAH", rating: 1891 },
  { seed: 33, name: "ERMİŞ, MURAT", rating: 1890 },
  { seed: 34, name: "KILIÇ, İHSAN", rating: 1880 },
  { seed: 35, name: "YÜKSEL, DAVUT CAN", rating: 1877 },
  { seed: 36, name: "AKYÜZ, MURAT", rating: 1873 },
  { seed: 37, name: "ASGHARVAND, DAVOOD", rating: 1865 },
  { seed: 38, name: "ÇİTİL, FEYZULLAH", rating: 1857 },
  { seed: 39, name: "GÖKDEMİR, DEMİR", rating: 1850 },
  { seed: 40, name: "SOYER, DENİZ", rating: 1850 },
  { seed: 41, name: "DEMİR, MUSTAFA ERKAN", rating: 1842 },
  { seed: 42, name: "TUTMAZ, BUĞRA HAMZA", rating: 1836 },
  { seed: 43, name: "AKTAŞ, İLKER", rating: 1835 },
  { seed: 44, name: "YARICI, FERHAT OĞUZHAN", rating: 1828 },
  { seed: 45, name: "KARABOĞA, NEŞET EREN", rating: 1821 },
  { seed: 46, name: "YOUSEFİAN, MAEDEH", rating: 1818 },
  { seed: 47, name: "ORAK, YUNUS", rating: 1817 },
  { seed: 48, name: "SALTIK, SÜLEYMAN", rating: 1807 },
  { seed: 49, name: "COŞKUN, KÜRŞAT", rating: 1800 },
  { seed: 50, name: "KALKAN, HÜSNÜ", rating: 1793 },
  { seed: 51, name: "YILDIZ, MUHAMMED TARIK", rating: 1787 },
  { seed: 52, name: "ÖNDER, MERT", rating: 1785 },
  { seed: 53, name: "ÜNAL, YUSUF EVCİM", rating: 1782 },
  { seed: 54, name: "ÖZTEPELİ, MUHAMMED DORUK", rating: 1777 },
  { seed: 55, name: "KOCAMAN, AHMET EYMEN", rating: 1765 },
  { seed: 56, name: "BOZDEMİR, DEMİR CAN", rating: 1759 },
  { seed: 57, name: "AHLATLI, YUSUF", rating: 1757 },
  { seed: 58, name: "KAMBUROĞLU, HAKAN", rating: 1748 },
  { seed: 59, name: "ALPASLAN, AYHAN", rating: 1746 },
  { seed: 60, name: "ALSHAREEF, MOSSA", rating: 1742 },
  { seed: 61, name: "ÇAPRAZ, ARDA", rating: 1729 },
  { seed: 62, name: "KASIMOĞLU, KAAN ÇINAR", rating: 1726 },
  { seed: 63, name: "ULUPINAR, SEMİH", rating: 1719 },
  { seed: 64, name: "SABUNCU, DERİN DARA", rating: 1717 },
  { seed: 65, name: "AKÇUN, FAYİK", rating: 1714 },
  { seed: 66, name: "SAEEDİ, REZA", rating: 1713 },
  { seed: 67, name: "KAPLAN, CEM AZAD", rating: 1701 },
];

export const MALATYA_UNPAIRED_SEEDS = [2, 50] as const;

export const MALATYA_ROUND_ONE: OfficialBenchmarkPairing[] = [
  { board: 1, whiteSeed: 1, blackSeed: 19, result: "½-½" },
  { board: 2, whiteSeed: 20, blackSeed: 3, result: "½-½" },
  { board: 3, whiteSeed: 4, blackSeed: 21, result: "½-½" },
  { board: 4, whiteSeed: 22, blackSeed: 5, result: "0-1" },
  { board: 5, whiteSeed: 6, blackSeed: 23, result: "1-0" },
  { board: 6, whiteSeed: 24, blackSeed: 7, result: "1-0" },
  { board: 7, whiteSeed: 8, blackSeed: 25, result: "1-0" },
  { board: 8, whiteSeed: 26, blackSeed: 9, result: "0-1" },
  { board: 9, whiteSeed: 10, blackSeed: 27, result: "0-1" },
  { board: 10, whiteSeed: 28, blackSeed: 11, result: "0-1" },
  { board: 11, whiteSeed: 12, blackSeed: 29, result: "0-1" },
  { board: 12, whiteSeed: 30, blackSeed: 13, result: "½-½" },
  { board: 13, whiteSeed: 14, blackSeed: 31, result: "1-0" },
  { board: 14, whiteSeed: 32, blackSeed: 15, result: "0-1" },
  { board: 15, whiteSeed: 16, blackSeed: 33, result: "1-0" },
  { board: 16, whiteSeed: 34, blackSeed: 17, result: "0-1" },
  { board: 17, whiteSeed: 18, blackSeed: 35, result: "1-0" },
  { board: 18, whiteSeed: 36, blackSeed: 52, result: "½-½" },
  { board: 19, whiteSeed: 53, blackSeed: 37, result: "0-1" },
  { board: 20, whiteSeed: 38, blackSeed: 54, result: "½-½" },
  { board: 21, whiteSeed: 55, blackSeed: 39, result: "0-1" },
  { board: 22, whiteSeed: 40, blackSeed: 56, result: "1-0" },
  { board: 23, whiteSeed: 57, blackSeed: 41, result: "½-½" },
  { board: 24, whiteSeed: 42, blackSeed: 58, result: "1-0" },
  { board: 25, whiteSeed: 59, blackSeed: 43, result: "1-0" },
  { board: 26, whiteSeed: 44, blackSeed: 60, result: "1-0" },
  { board: 27, whiteSeed: 61, blackSeed: 45, result: "½-½" },
  { board: 28, whiteSeed: 46, blackSeed: 62, result: "1-0" },
  { board: 29, whiteSeed: 63, blackSeed: 47, result: "0-1" },
  { board: 30, whiteSeed: 48, blackSeed: 64, result: "1-0" },
  { board: 31, whiteSeed: 65, blackSeed: 49, result: "1-0" },
  { board: 32, whiteSeed: 51, blackSeed: 66, result: "1-0" },
  { board: 33, whiteSeed: 67, blackSeed: null, result: "1-BYE" },
];

function playerId(seed: number) {
  return `seed-${seed}`;
}

function seedFromPlayerId(id: string | null) {
  return id ? Number(id.replace("seed-", "")) : null;
}

function pairingKey(whiteSeed: number, blackSeed: number | null) {
  if (blackSeed === null) return `bye:${whiteSeed}`;
  return [whiteSeed, blackSeed].sort((a, b) => a - b).join(":");
}

export function createMalatyaRoundOneAudit() {
  const unpaired = new Set<number>(MALATYA_UNPAIRED_SEEDS);
  const activePlayers = MALATYA_PLAYERS.filter((player) => !unpaired.has(player.seed));
  const generated = createSwissPairings(
    hydratePairingPlayers(
      activePlayers.map((player) => ({
        id: playerId(player.seed),
        name: player.name,
        rating: player.rating,
        seed: player.seed,
      })),
      [],
    ),
  ).map((pairing, index) => ({
    board: index + 1,
    whiteSeed: seedFromPlayerId(pairing.whitePlayerId)!,
    blackSeed: seedFromPlayerId(pairing.blackPlayerId),
  }));

  const generatedByKey = new Map(
    generated.map((pairing) => [
      pairingKey(pairing.whiteSeed, pairing.blackSeed),
      pairing,
    ]),
  );

  const rows = MALATYA_ROUND_ONE.map((official, index) => {
    const sameBoard = generated[index];
    const matchup = generatedByKey.get(
      pairingKey(official.whiteSeed, official.blackSeed),
    );
    const sameBoardOpponents =
      pairingKey(sameBoard.whiteSeed, sameBoard.blackSeed) ===
      pairingKey(official.whiteSeed, official.blackSeed);
    const exactColors =
      sameBoard.whiteSeed === official.whiteSeed &&
      sameBoard.blackSeed === official.blackSeed;

    const status = exactColors
      ? "exact"
      : sameBoardOpponents
        ? "colors-reversed"
        : matchup
          ? "different-board"
          : "different-matchup";

    return { official, generated: sameBoard, matchup, status } as const;
  });

  return {
    activePlayerCount: activePlayers.length,
    generated,
    rows,
    stats: {
      exactBoardAndColors: rows.filter((row) => row.status === "exact").length,
      sameOpponentsSameBoard: rows.filter(
        (row) => row.status === "exact" || row.status === "colors-reversed",
      ).length,
      sameMatchupAnywhere: rows.filter((row) => row.matchup).length,
      differentMatchups: rows.filter((row) => !row.matchup).length,
    },
  };
}

export function benchmarkPlayer(seed: number | null) {
  return seed === null
    ? null
    : MALATYA_PLAYERS.find((player) => player.seed === seed) ?? null;
}
