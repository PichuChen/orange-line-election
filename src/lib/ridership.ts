import profileJson from '../data/ridership-profile.json';
import type { OfficialDeparture } from './trtc';

type DayKind = 'weekday' | 'holiday';
type StationProfile = Record<string, number[]>;
type RidershipProfile = {
  sourceMonth: string | null;
  generatedAt: string | null;
  method: string;
  weekday: StationProfile;
  holiday: StationProfile;
};

const profile = profileJson as RidershipProfile;

export type RidershipEstimate = {
  estimatedVoters: number;
  ridershipSourceMonth: string;
  ridershipMethod: 'orange-line-od-lower-bound';
};

function taipeiParts(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(map.hour), weekday: map.weekday };
}

function dayKind(now: Date): DayKind {
  // Match the timetable selection: weekend uses the holiday profile.
  const serviceClock = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const { weekday } = taipeiParts(serviceClock);
  return weekday === 'Sat' || weekday === 'Sun' ? 'holiday' : 'weekday';
}

function departureHour(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? Number(match[1]) : null;
}

export function estimateRidership(
  stationID: string,
  departures: OfficialDeparture[],
  now = new Date(),
): RidershipEstimate | null {
  if (!profile.sourceMonth) return null;

  const { hour } = taipeiParts(now);
  const hourlyFlow = profile[dayKind(now)]?.[stationID]?.[hour];
  if (!Number.isFinite(hourlyFlow) || hourlyFlow <= 0) return null;

  const trainsThisHour = departures.filter((item) => departureHour(item.departure) === hour).length;
  if (!trainsThisHour) return null;

  // The profile is a conservative lower bound: it only includes OD pairs whose
  // origin and destination are both on the Orange Line and definitely cross the
  // selected northbound segment. Transfer passengers are not fully represented.
  const estimatedVoters = Math.max(1, Math.round(hourlyFlow / trainsThisHour));

  return {
    estimatedVoters,
    ridershipSourceMonth: profile.sourceMonth,
    ridershipMethod: 'orange-line-od-lower-bound',
  };
}
