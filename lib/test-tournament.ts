export const TEST_TOURNAMENT_PLAYER_COUNT = 64;
export const TEST_TOURNAMENT_SOURCE = "2700chess · September 2026 Top 64";

export type TestTournamentPlayer = {
  name: string;
  fideId: string;
  rating: number;
  seed: number;
};

export function createTestTournamentRoster(): TestTournamentPlayer[] {
  const players: Array<[string, number]> = [
    ["Carlsen, Magnus", 2823],
    ["Nakamura, Hikaru", 2792],
    ["Caruana, Fabiano", 2789],
    ["Sindarov, Javokhir", 2778],
    ["So, Wesley", 2774],
    ["Keymer, Vincent", 2764],
    ["Abdusattorov, Nodirbek", 2762],
    ["Praggnanandhaa R", 2761],
    ["Erigaisi Arjun", 2759],
    ["Giri, Anish", 2757],
    ["Firouzja, Alireza", 2757],
    ["Wei, Yi", 2752],
    ["Duda, Jan-Krzysztof", 2743],
    ["Anand, Viswanathan", 2739],
    ["Tabatabaei, M. Amin", 2737],
    ["Ding, Liren", 2733],
    ["Dominguez Perez, Leinier", 2732],
    ["Le Quang Liem", 2732],
    ["Rapport, Richard", 2726],
    ["Aronian, Levon", 2725],
    ["Niemann, Hans Moke", 2725],
    ["Mamedyarov, Shakhriyar", 2720],
    ["Nepomniachtchi, Ian", 2719],
    ["Vachier-Lagrave, Maxime", 2718],
    ["Nihal Sarin", 2718],
    ["Erdogmus, Yagiz Kaan", 2716],
    ["Andreikin, Dmitry", 2714],
    ["Yu, Yangyi", 2710],
    ["Sevian, Samuel", 2708],
    ["Van Foreest, Jorden", 2706],
    ["Maghsoodloo, Parham", 2705],
    ["Gukesh D", 2703],
    ["Vidit, Santosh Gujrathi", 2697],
    ["Topalov, Veselin", 2695],
    ["Wang, Hao", 2694],
    ["Liang, Awonder", 2693],
    ["Fedoseev, Vladimir", 2691],
    ["Radjabov, Teimour", 2689],
    ["Yakubboev, Nodirbek", 2685],
    ["Esipenko, Andrey", 2680],
    ["Pranav, V", 2677],
    ["Aravindh, Chithambaram VR.", 2677],
    ["Leko, Peter", 2676],
    ["Pranesh M", 2674],
    ["Sarana, Alexey", 2666],
    ["Vitiugov, Nikita", 2666],
    ["Howell, David W L", 2665],
    ["Kasimdzhanov, Rustam", 2665],
    ["Suleymanli, Aydin", 2664],
    ["Martirosyan, Haik M.", 2664],
    ["Eljanov, Pavel", 2664],
    ["Bluebaum, Matthias", 2662],
    ["Robson, Ray", 2659],
    ["Wojtaszek, Radoslaw", 2658],
    ["Martinez Alcantara, Jose Eduardo", 2657],
    ["Murzin, Volodar", 2656],
    ["Alekseenko, Kirill", 2656],
    ["Christiansen J", 2656],
    ["Xiong, Jeffery", 2656],
    ["Svane, Frederik", 2655],
    ["Vokhidov, Shamsiddin", 2654],
    ["Dubov, Daniil", 2654],
    ["Morozevich, Alexander", 2654],
    ["Muradli, Mahammad", 2653],
  ];

  return players.map(([name, rating], index) => ({
    name,
    fideId: "",
    rating,
    seed: index + 1,
  }));
}
