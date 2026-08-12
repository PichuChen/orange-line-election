import { env } from 'cloudflare:workers';
import {
  getLiveBoard,
  getStationTimeTable,
  hasTdxCredentials,
  type LiveBoard,
  type StationTimeTable,
} from './tdx';

export type Camp = 'luzhou' | 'huilong';
export type ResolveSource = 'liveboard' | 'timetable' | 'demo';

export type TrainResolution = {
  camp: Camp;
  destinationZh: '蘆洲' | '迴龍';
  destinationEn: 'Luzhou' | 'Huilong';
  source: ResolveSource;
  confidence: number;
  matchedDeparture?: string;
  estimateTime?: number | null;
  observedAt: string;
};

const DAY_KEYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function destinationCamp(item: {
  DestinationStationID?: string;
  DestinationStaionID?: string;
  DestinationStationName?: { Zh_tw?: string; En?: string };
}): Camp | null {
  const id = item.DestinationStationID ?? item.DestinationStaionID ?? '';
  const zh = item.DestinationStationName?.Zh_tw ?? '';
  const en = item.DestinationStationName?.En ?? '';
  const text = `${id} ${zh} ${en}`.toLowerCase();

  if (text.includes('蘆洲') || text.includes('luzhou') || id === 'O54') return 'luzhou';
  if (text.includes('迴龍') || text.includes('huilong') || id === 'O21') return 'huilong';
  return null;
}

function taipeiClock(now: Date): { hour: number; minute: number; weekday: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? now.getUTCDay(),
    iso: now.toISOString(),
  };
}

function hmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function makeResult(
  camp: Camp,
  source: ResolveSource,
  confidence: number,
  now: Date,
  extra: Partial<TrainResolution> = {},
): TrainResolution {
  return {
    camp,
    destinationZh: camp === 'luzhou' ? '蘆洲' : '迴龍',
    destinationEn: camp === 'luzhou' ? 'Luzhou' : 'Huilong',
    source,
    confidence,
    observedAt: now.toISOString(),
    ...extra,
  };
}

function fromLiveBoard(items: LiveBoard[], now: Date): TrainResolution | null {
  const candidates = items
    .map((item) => ({ item, camp: destinationCamp(item) }))
    .filter((entry): entry is { item: LiveBoard; camp: Camp } => Boolean(entry.camp))
    .filter(({ item }) => item.ServiceStatus === undefined || item.ServiceStatus === 0 || item.ServiceStatus === 1)
    .sort((a, b) => (a.item.EstimateTime ?? 99) - (b.item.EstimateTime ?? 99));

  const best = candidates[0];
  if (!best) return null;

  if (best.item.EstimateTime !== null && best.item.EstimateTime !== undefined && best.item.EstimateTime <= 1) {
    return makeResult(best.camp, 'liveboard', 0.97, now, {
      estimateTime: best.item.EstimateTime,
    });
  }

  return null;
}

function fromTimetable(items: StationTimeTable[], now: Date): TrainResolution | null {
  const clock = taipeiClock(now);
  const current = clock.hour * 60 + clock.minute;
  const dayKey = DAY_KEYS[clock.weekday];
  const departures: Array<{ camp: Camp; departure: string; delta: number }> = [];

  for (const item of items) {
    const camp = destinationCamp(item);
    if (!camp) continue;
    if (item.ServiceDay && item.ServiceDay[dayKey] === false) continue;

    for (const timetable of item.Timetables ?? []) {
      const minute = hmToMinutes(timetable.DepartureTime || timetable.ArrivalTime);
      if (minute === null) continue;
      departures.push({
        camp,
        departure: timetable.DepartureTime || timetable.ArrivalTime,
        delta: minute - current,
      });
    }
  }

  if (!departures.length) return null;

  departures.sort((a, b) => {
    const score = (d: number) => Math.abs(d) + (d > 0 ? 1.25 : 0);
    return score(a.delta) - score(b.delta);
  });

  const best = departures[0];
  if (Math.abs(best.delta) > 8) return null;

  const confidence = Math.max(0.68, 0.91 - Math.abs(best.delta) * 0.035);
  return makeResult(best.camp, 'timetable', confidence, now, {
    matchedDeparture: best.departure,
  });
}

function demo(stationID: string, now: Date): TrainResolution {
  const clock = taipeiClock(now);
  const seed = [...stationID].reduce((sum, char) => sum + char.charCodeAt(0), 0) + clock.minute;
  const camp: Camp = seed % 2 === 0 ? 'luzhou' : 'huilong';
  return makeResult(camp, 'demo', 0.88, now, {
    matchedDeparture: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
  });
}

export async function resolveTrain(stationID: string, now = new Date()): Promise<TrainResolution> {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const forceDemo = runtimeEnv.ORANGE_LINE_DEMO === 'true';
  if (forceDemo || !hasTdxCredentials()) return demo(stationID, now);

  try {
    const live = await getLiveBoard(stationID);
    const liveResult = fromLiveBoard(live, now);
    if (liveResult) return liveResult;
  } catch (error) {
    console.warn('LiveBoard lookup failed; falling back to timetable', error);
  }

  try {
    const timetable = await getStationTimeTable(stationID);
    const timetableResult = fromTimetable(timetable, now);
    if (timetableResult) return timetableResult;
  } catch (error) {
    console.warn('StationTimeTable lookup failed; falling back to demo', error);
  }

  return demo(stationID, now);
}
