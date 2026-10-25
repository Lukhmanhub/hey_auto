// World layout + rules. The town is a grid of N×N blocks; roads run along
// every grid line. Kerala drives on the LEFT.

export const N = 8;              // blocks per side
export const B = 60;             // road-centre to road-centre (m)
export const ROAD_HALF = 3.5;    // carriageway half width: a narrow Kochi town road, two tight lanes
export const LANE = 1.75;        // lane centre offset from road centre
export const KERB = 5;           // kerb line: asphalt, then a broken gravel shoulder and an open drain, then the kerb
export const WALK_IN = 8;        // inner edge of the footpath, from road centre
export const HALF = (N * B) / 2;
export const BOUND = HALF + 26;  // invisible wall
export const SPEED_LIMIT = 50;   // km/h, town-wide
export const CANAL_ROW = 4;      // block row j that is backwater

export const TOWN = 'Kochi';
export const TOWN_ML = 'കൊച്ചി';

// grid line index → world coordinate (same for x and z)
export const gx = (i) => i * B - HALF;

// One-way roads. Rows are horizontal roads (constant z) → allowed x direction.
// Cols are vertical roads (constant x) → allowed z direction.
export const ONE_WAY_ROWS = { 2: 1 };
export const ONE_WAY_COLS = { 6: -1 };

// Signalised junctions [i, j]
export const SIGNALS = [[2, 2], [4, 2], [6, 3], [3, 5], [5, 6], [1, 5], [4, 4]];

// Real Ernakulam street names on the grid (the layout itself is not to scale). Index = grid line.
// Vertical roads run along z (constant x); horizontal roads run along x (constant z).
export const ROAD_NAMES = {
  v: ['Thammanam Road', 'Kaloor–Kadavanthra Road', 'Chittoor Road', 'Banerji Road', 'MG Road', 'Park Avenue', 'Market Road', 'Convent Road', 'Seaport–Airport Road'],
  h: ['NH 66 Bypass', 'Palarivattom Road', 'Broadway', 'Sahodaran Ayyappan Road', 'Shanmugham Road', 'Marine Drive', 'Rajaji Road', 'Jos Junction Road', 'Hospital Road'],
};
export const METRO_LINE = 4;   // the Kochi Metro viaduct runs above MG Road (vertical grid line 4)

export const LANDMARKS = {
  '2,6': { kind: 'temple', name: 'Ernakulathappan Temple', ml: 'എറണാകുളത്തപ്പൻ ക്ഷേത്രം', short: 'Shiva temple', shortMl: 'അമ്പലം' },
  '5,2': { kind: 'church', name: "St. Mary's Basilica", ml: 'സെന്റ് മേരീസ് ബസിലിക്ക', short: 'Basilica', shortMl: 'പള്ളി' },
  '6,5': { kind: 'mosque', name: 'Kaloor Juma Masjid', ml: 'കലൂർ ജുമാ മസ്ജിദ്', short: 'Masjid', shortMl: 'മസ്ജിദ്' },
  '3,2': { kind: 'busstand', name: 'Vyttila Mobility Hub', ml: 'വൈറ്റില ഹബ്', short: 'Vyttila Hub', shortMl: 'വൈറ്റില ഹബ്' },
  '6,1': { kind: 'hospital', name: 'General Hospital', ml: 'ജനറൽ ആശുപത്രി', short: 'General Hospital', shortMl: 'ജനറൽ ആശുപത്രി' },
  '0,6': { kind: 'railway', name: 'Ernakulam Junction', ml: 'എറണാകുളം ജംഗ്ഷൻ', short: 'Ernakulam South', shortMl: 'സൗത്ത് സ്റ്റേഷൻ' },
  '2,4': { kind: 'jetty', name: 'Ernakulam Boat Jetty', ml: 'ബോട്ട് ജെട്ടി', short: 'Boat jetty', shortMl: 'ബോട്ട് ജെട്ടി' },
  '4,6': { kind: 'toddy', name: 'Kallu Shappu', ml: 'കള്ള് ഷാപ്പ്', short: 'Shappu', shortMl: 'ഷാപ്പ്' },
  '1,3': { kind: 'school', name: 'Govt. LP School', ml: 'ഗവ. എൽ.പി. സ്കൂൾ', short: 'School', shortMl: 'സ്കൂൾ' },
  '4,7': { kind: 'fishmarket', name: 'Chambakkara Fish Market', ml: 'ചമ്പക്കര മീൻ ചന്ത', short: 'Meen chantha', shortMl: 'മീൻ ചന്ത' },
  '3,0': { kind: 'mall', name: 'Lulu Mall', ml: 'ലുലു മാൾ', short: 'Lulu Mall', shortMl: 'ലുലു മാൾ' },
  '4,1': { kind: 'stadium', name: 'JLN Stadium, Kaloor', ml: 'കലൂർ സ്റ്റേഡിയം', short: 'Kaloor Stadium', shortMl: 'കലൂർ സ്റ്റേഡിയം' },
};

const PADDY = new Set(['0,0', '1,0', '0,1', '7,7', '6,7', '7,6', '2,1', '5,6']);

export function blockKind(i, j) {
  const k = `${i},${j}`;
  if (LANDMARKS[k]) return LANDMARKS[k].kind;
  if (j === CANAL_ROW) return 'canal';
  if (PADDY.has(k)) return 'paddy';
  return 'town';
}
export const isWaterBlock = (i, j) => j === CANAL_ROW;
export const hasFootpath = (i, j) => !isWaterBlock(i, j) && blockKind(i, j) !== 'paddy';

// Is travelling from node a → node b allowed (one-way rules)?
export function edgeAllowed(ai, aj, bi, bj) {
  if (aj === bj && ONE_WAY_ROWS[aj] !== undefined) return Math.sign(bi - ai) === ONE_WAY_ROWS[aj];
  if (ai === bi && ONE_WAY_COLS[ai] !== undefined) return Math.sign(bj - aj) === ONE_WAY_COLS[ai];
  return true;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
