import { haversineKm, isValidCoordinate } from "./haversine";

/**
 * Offline place naming. A small bundled index of cities (Italy-dense, plus the
 * world's most visited places). A coordinate is labelled with the NEAREST city only
 * when it is within MAX_KM — otherwise it stays unnamed ("Luogo da nominare"), so the
 * app never pretends a remote spot is a city it isn't.
 *
 * No network, no location permission, no tracking: it only reads the coordinates
 * already stored in the user's own photos. Labels are approximate ("vicino a") and
 * always overridable by a manual name.
 */
export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

const MAX_KM = 45;

// [name, country, lat, lon]
const RAW: [string, string, number, number][] = [
  // Italia
  ["Roma", "Italia", 41.9028, 12.4964], ["Milano", "Italia", 45.4642, 9.19], ["Napoli", "Italia", 40.8518, 14.2681],
  ["Torino", "Italia", 45.0703, 7.6869], ["Firenze", "Italia", 43.7696, 11.2558], ["Venezia", "Italia", 45.4408, 12.3155],
  ["Bologna", "Italia", 44.4949, 11.3426], ["Genova", "Italia", 44.4056, 8.9463], ["Palermo", "Italia", 38.1157, 13.3615],
  ["Catania", "Italia", 37.5079, 15.083], ["Bari", "Italia", 41.1171, 16.8719], ["Verona", "Italia", 45.4384, 10.9916],
  ["Padova", "Italia", 45.4064, 11.8768], ["Trieste", "Italia", 45.6495, 13.7768], ["Pisa", "Italia", 43.7228, 10.4017],
  ["Siena", "Italia", 43.3188, 11.3308], ["Perugia", "Italia", 43.1107, 12.3908], ["Ancona", "Italia", 43.6158, 13.5189],
  ["Pescara", "Italia", 42.4618, 14.2161], ["Cagliari", "Italia", 39.2238, 9.1217], ["Olbia", "Italia", 40.9234, 9.4968],
  ["Sassari", "Italia", 40.7259, 8.5557], ["Lecce", "Italia", 40.3515, 18.175], ["Matera", "Italia", 40.6664, 16.6043],
  ["Reggio Calabria", "Italia", 38.1113, 15.6473], ["Cosenza", "Italia", 39.2983, 16.2537], ["Salerno", "Italia", 40.6824, 14.7681],
  ["Sorrento", "Italia", 40.6263, 14.3758], ["Amalfi", "Italia", 40.634, 14.6027], ["Siracusa", "Italia", 37.0755, 15.2866],
  ["Taormina", "Italia", 37.8516, 15.2853], ["Trento", "Italia", 46.0748, 11.1217], ["Bolzano", "Italia", 46.4983, 11.3548],
  ["Cortina d'Ampezzo", "Italia", 46.5405, 12.1357], ["Como", "Italia", 45.8081, 9.0852], ["Bergamo", "Italia", 45.6983, 9.6773],
  ["Brescia", "Italia", 45.5416, 10.2118], ["Parma", "Italia", 44.8015, 10.3279], ["Modena", "Italia", 44.6471, 10.9252],
  ["Rimini", "Italia", 44.0678, 12.5695], ["Ravenna", "Italia", 44.4184, 12.2035], ["Udine", "Italia", 46.0711, 13.2346],
  ["Aosta", "Italia", 45.7375, 7.3154], ["La Spezia", "Italia", 44.1025, 9.824], ["Sanremo", "Italia", 43.8159, 7.7761],
  ["Livorno", "Italia", 43.5485, 10.3106], ["Lucca", "Italia", 43.8429, 10.5027], ["L'Aquila", "Italia", 42.3498, 13.3995],
  ["Potenza", "Italia", 40.6401, 15.8056], ["Campobasso", "Italia", 41.5603, 14.6627], ["Trapani", "Italia", 38.0176, 12.5365],
  ["Agrigento", "Italia", 37.311, 13.5765], ["Lampedusa", "Italia", 35.5075, 12.6064], ["Capri", "Italia", 40.5532, 14.2222],
  ["Riva del Garda", "Italia", 45.8858, 10.8418], ["Portofino", "Italia", 44.3036, 9.2097],
  // Europa
  ["Parigi", "Francia", 48.8566, 2.3522], ["Nizza", "Francia", 43.7102, 7.262], ["Marsiglia", "Francia", 43.2965, 5.3698],
  ["Lione", "Francia", 45.764, 4.8357], ["Bordeaux", "Francia", 44.8378, -0.5792], ["Londra", "Regno Unito", 51.5072, -0.1276],
  ["Edimburgo", "Regno Unito", 55.9533, -3.1883], ["Dublino", "Irlanda", 53.3498, -6.2603], ["Madrid", "Spagna", 40.4168, -3.7038],
  ["Barcellona", "Spagna", 41.3874, 2.1686], ["Siviglia", "Spagna", 37.3891, -5.9845], ["Valencia", "Spagna", 39.4699, -0.3763],
  ["Palma di Maiorca", "Spagna", 39.5696, 2.6502], ["Ibiza", "Spagna", 38.9067, 1.4206], ["Tenerife", "Spagna", 28.2916, -16.6291],
  ["Lisbona", "Portogallo", 38.7223, -9.1393], ["Porto", "Portogallo", 41.1579, -8.6291], ["Faro", "Portogallo", 37.0194, -7.9322],
  ["Berlino", "Germania", 52.52, 13.405], ["Monaco di Baviera", "Germania", 48.1351, 11.582], ["Amburgo", "Germania", 53.5511, 9.9937],
  ["Francoforte", "Germania", 50.1109, 8.6821], ["Vienna", "Austria", 48.2082, 16.3738], ["Salisburgo", "Austria", 47.8095, 13.055],
  ["Zurigo", "Svizzera", 47.3769, 8.5417], ["Ginevra", "Svizzera", 46.2044, 6.1432], ["Lugano", "Svizzera", 46.0037, 8.9511],
  ["Amsterdam", "Paesi Bassi", 52.3676, 4.9041], ["Bruxelles", "Belgio", 50.8503, 4.3517], ["Copenaghen", "Danimarca", 55.6761, 12.5683],
  ["Stoccolma", "Svezia", 59.3293, 18.0686], ["Oslo", "Norvegia", 59.9139, 10.7522], ["Helsinki", "Finlandia", 60.1699, 24.9384],
  ["Reykjavik", "Islanda", 64.1466, -21.9426], ["Praga", "Cechia", 50.0755, 14.4378], ["Budapest", "Ungheria", 47.4979, 19.0402],
  ["Varsavia", "Polonia", 52.2297, 21.0122], ["Cracovia", "Polonia", 50.0647, 19.945], ["Atene", "Grecia", 37.9838, 23.7275],
  ["Santorini", "Grecia", 36.3932, 25.4615], ["Mykonos", "Grecia", 37.4467, 25.3289], ["Creta", "Grecia", 35.3387, 25.1442],
  ["Spalato", "Croazia", 43.5081, 16.4402], ["Dubrovnik", "Croazia", 42.6507, 18.0944], ["Lubiana", "Slovenia", 46.0569, 14.5058],
  ["Istanbul", "Turchia", 41.0082, 28.9784], ["Malta", "Malta", 35.8989, 14.5146], ["Nicosia", "Cipro", 35.1856, 33.3823],
  // Mondo
  ["New York", "Stati Uniti", 40.7128, -74.006], ["Los Angeles", "Stati Uniti", 34.0522, -118.2437],
  ["San Francisco", "Stati Uniti", 37.7749, -122.4194], ["Miami", "Stati Uniti", 25.7617, -80.1918],
  ["Chicago", "Stati Uniti", 41.8781, -87.6298], ["Las Vegas", "Stati Uniti", 36.1699, -115.1398],
  ["Honolulu", "Stati Uniti", 21.3069, -157.8583], ["Toronto", "Canada", 43.6532, -79.3832], ["Montréal", "Canada", 45.5019, -73.5674],
  ["Vancouver", "Canada", 49.2827, -123.1207], ["Città del Messico", "Messico", 19.4326, -99.1332], ["Cancún", "Messico", 21.1619, -86.8515],
  ["L'Avana", "Cuba", 23.1136, -82.3666], ["Rio de Janeiro", "Brasile", -22.9068, -43.1729], ["San Paolo", "Brasile", -23.5558, -46.6396],
  ["Buenos Aires", "Argentina", -34.6037, -58.3816], ["Lima", "Perù", -12.0464, -77.0428], ["Cusco", "Perù", -13.532, -71.9675],
  ["Santiago", "Cile", -33.4489, -70.6693], ["Marrakech", "Marocco", 31.6295, -7.9811], ["Il Cairo", "Egitto", 30.0444, 31.2357],
  ["Sharm el-Sheikh", "Egitto", 27.9158, 34.33], ["Città del Capo", "Sudafrica", -33.9249, 18.4241], ["Zanzibar", "Tanzania", -6.1659, 39.2026],
  ["Nairobi", "Kenya", -1.2921, 36.8219], ["Dubai", "Emirati Arabi", 25.2048, 55.2708], ["Gerusalemme", "Israele", 31.7683, 35.2137],
  ["Maldive", "Maldive", 4.1755, 73.5093], ["Mumbai", "India", 19.076, 72.8777], ["Nuova Delhi", "India", 28.6139, 77.209],
  ["Bangkok", "Thailandia", 13.7563, 100.5018], ["Phuket", "Thailandia", 7.8804, 98.3923], ["Singapore", "Singapore", 1.3521, 103.8198],
  ["Bali", "Indonesia", -8.3405, 115.092], ["Hanoi", "Vietnam", 21.0278, 105.8342], ["Hong Kong", "Cina", 22.3193, 114.1694],
  ["Pechino", "Cina", 39.9042, 116.4074], ["Shanghai", "Cina", 31.2304, 121.4737], ["Seul", "Corea del Sud", 37.5665, 126.978],
  ["Tokyo", "Giappone", 35.6762, 139.6503], ["Kyoto", "Giappone", 35.0116, 135.7681], ["Osaka", "Giappone", 34.6937, 135.5023],
  ["Sydney", "Australia", -33.8688, 151.2093], ["Melbourne", "Australia", -37.8136, 144.9631], ["Auckland", "Nuova Zelanda", -36.8485, 174.7633],
  ["Suva", "Figi", -18.1416, 178.4419], ["Nadi", "Figi", -17.7765, 177.4356], ["Rakiraki", "Figi", -17.3667, 178.0833],
  ["Papeete", "Polinesia francese", -17.5516, -149.5585], ["Taveuni", "Figi", -16.8406, 179.9728],
];

export const CITIES: City[] = RAW.map(([name, country, lat, lon]) => ({ name, country, lat, lon }));

export function nearestCity(lat: number | null, lon: number | null, maxKm: number = MAX_KM): City | null {
  if (!isValidCoordinate(lat, lon)) return null;
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    // Cheap bounding pre-check (antimeridian-aware on longitude).
    if (Math.abs(c.lat - (lat as number)) > 2) continue;
    const d = haversineKm(lat as number, lon as number, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= maxKm ? best : null;
}

export interface CityGroup {
  city: City;
  count: number;
}

/** Title for a group of photos that may span several cities, most photos first:
 * "Roma" · "Roma e Oslo" · "Roma, Oslo e altri 3". */
export function groupTitle(groups: CityGroup[]): string {
  if (groups.length === 0) return "Luogo da nominare";
  if (groups.length === 1) return groups[0].city.name;
  if (groups.length === 2) return `${groups[0].city.name} e ${groups[1].city.name}`;
  return `${groups[0].city.name}, ${groups[1].city.name} e altri ${groups.length - 2}`;
}

/** Most frequent nearby city across a set of coordinates (e.g. a memory chapter). */
export function dominantCity(points: { lat: number | null; lon: number | null }[]): City | null {
  const counts = new Map<string, { city: City; n: number }>();
  for (const p of points) {
    const c = nearestCity(p.lat, p.lon);
    if (!c) continue;
    const e = counts.get(c.name);
    if (e) e.n += 1;
    else counts.set(c.name, { city: c, n: 1 });
  }
  let best: { city: City; n: number } | null = null;
  counts.forEach((v) => {
    if (!best || v.n > best.n) best = v;
  });
  return best ? (best as { city: City; n: number }).city : null;
}
