const TIMETABLE_WEEKDAY_URL =
  'https://data.taipei/api/dataset/91cc11bb-40d6-4837-9303-84e6a666c568/resource/c526a43a-fc82-4ba3-beda-0497a303fc4a/download';
const TIMETABLE_HOLIDAY_URL =
  'https://data.taipei/api/dataset/91cc11bb-40d6-4837-9303-84e6a666c568/resource/6d2a2636-825d-4ec2-b4f5-9f853add9472/download';

export type Camp = 'luzhou' | 'huilong';
export type OfficialDeparture = {
  camp: Camp;
  departure: string;
};

type CsvRow = Record<string, string>;
type ScheduleKind = 'weekday' | 'holiday';

type CacheEntry = {
  expiresAt: number;
  rows: CsvRow[];
};

const timetableCache = new Map<ScheduleKind, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
}

function csvObjects(text: string): CsvRow[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ''));
  const [header, ...body] = parsed;
  if (!header) return [];

  return body.map((values) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), values[index]?.trim() ?? ''])),
  );
}

function normalizeStationID(value: string): string {
  const match = /^O0?(\d+)$/.exec(value.trim().toUpperCase());
  return match ? `O${Number(match[1])}` : value.trim().toUpperCase();
}

function rowCamp(row: CsvRow): Camp | null {
  const text = [
    row.DestinationStaionID,
    row.DestinationStationID,
    row.DestinationStationName,
  ].filter(Boolean).join(' ').toLowerCase();

  if (text.includes('蘆洲') || text.includes('luzhou') || text.includes('o54')) return 'luzhou';
  if (text.includes('迴龍') || text.includes('huilong') || text.includes('o21')) return 'huilong';
  return null;
}

function scheduleKind(now: Date): ScheduleKind {
  // Metro service after midnight belongs to the previous service day.
  const serviceClock = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  }).format(serviceClock);
  return label === 'Sat' || label === 'Sun' ? 'holiday' : 'weekday';
}

async function getRows(kind: ScheduleKind): Promise<CsvRow[]> {
  const cached = timetableCache.get(kind);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const url = kind === 'weekday' ? TIMETABLE_WEEKDAY_URL : TIMETABLE_HOLIDAY_URL;
  const response = await fetch(url, {
    headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
  });
  if (!response.ok) {
    throw new Error(`TRTC timetable request failed: ${response.status}`);
  }

  const rows = csvObjects(await response.text());
  if (!rows.length) throw new Error('TRTC timetable response was empty');

  timetableCache.set(kind, { expiresAt: Date.now() + CACHE_TTL_MS, rows });
  return rows;
}

export async function getOfficialDepartures(stationID: string, now = new Date()): Promise<OfficialDeparture[]> {
  const target = normalizeStationID(stationID);
  const rows = await getRows(scheduleKind(now));
  const departures: OfficialDeparture[] = [];

  for (const row of rows) {
    if (normalizeStationID(row.StationID ?? '') !== target) continue;
    const camp = rowCamp(row);
    if (!camp) continue;

    const rawTimes = row.DepartureTimes ?? '';
    const times = rawTimes.match(/\b(?:[0-2]?\d):[0-5]\d(?::[0-5]\d)?\b/g) ?? [];
    for (const time of times) departures.push({ camp, departure: time.slice(0, 5) });
  }

  return departures;
}
