import { env } from 'cloudflare:workers';
import { getOfficialDepartures, type Camp, type OfficialDeparture } from './trtc';
import { estimateRidership } from './ridership';

export type { Camp };
export type ResolveSource = 'timetable' | 'demo';

export type TrainResolution = {
  camp: Camp;
  destinationZh: '蘆洲' | '迴龍';
  destinationEn: 'Luzhou' | 'Huilong';
  source: ResolveSource;
  confidence: number;
  matchedDeparture?: string;
  observedAt: string;
  estimatedVoters?: number;
  ridershipSourceMonth?: string;
  ridershipMethod?: 'orange-line-od-lower-bound';
};

function taipeiClock(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(map.hour), minute: Number(map.minute) };
}

function serviceMinutes(value: string, currentHour: number): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (currentHour < 4 && hour < 4) hour += 24;
  return hour * 60 + minute;
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

function fromOfficialTimetable(items: OfficialDeparture[], now: Date): TrainResolution | null {
  const clock = taipeiClock(now);
  const currentHour = clock.hour;
  const current = (clock.hour < 4 ? clock.hour + 24 : clock.hour) * 60 + clock.minute;

  const candidates = items
    .map((item) => {
      const minute = serviceMinutes(item.departure, currentHour);
      return minute === null ? null : { ...item, delta: minute - current };
    })
    .filter((item): item is OfficialDeparture & { delta: number } => Boolean(item));

  if (!candidates.length) return null;

  // 「剛剛上車」：同樣距離時，優先選已離站的班次。
  candidates.sort((a, b) => {
    const score = (delta: number) => Math.abs(delta) + (delta > 0 ? 1.5 : 0);
    return score(a.delta) - score(b.delta);
  });

  const best = candidates[0];
  if (Math.abs(best.delta) > 8) return null;

  const confidence = Math.max(0.72, 0.96 - Math.abs(best.delta) * 0.045);
  return makeResult(best.camp, 'timetable', confidence, now, {
    matchedDeparture: best.departure,
  });
}

function demo(stationID: string, now: Date): TrainResolution {
  const clock = taipeiClock(now);
  const seed = [...stationID].reduce((sum, char) => sum + char.charCodeAt(0), 0) + clock.minute;
  const camp: Camp = seed % 2 === 0 ? 'luzhou' : 'huilong';
  return makeResult(camp, 'demo', 0.5, now, {
    matchedDeparture: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
  });
}

export async function resolveTrain(stationID: string, now = new Date()): Promise<TrainResolution> {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  if (runtimeEnv.ORANGE_LINE_DEMO === 'true') return demo(stationID, now);

  try {
    const departures = await getOfficialDepartures(stationID, now);
    const result = fromOfficialTimetable(departures, now);
    if (result) {
      const ridership = estimateRidership(stationID, departures, now);
      return ridership ? { ...result, ...ridership } : result;
    }
  } catch (error) {
    console.warn('TRTC official timetable lookup failed; falling back to demo', error);
  }

  return demo(stationID, now);
}
