import { env } from 'cloudflare:workers';

const TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const API_BASE = 'https://tdx.transportdata.tw/api/basic/v2/Rail/Metro';

type NameType = { Zh_tw?: string; En?: string };

export type LiveBoard = {
  LineID?: string;
  StationID: string;
  StationName?: NameType;
  TripHeadSign?: string;
  DestinationStaionID?: string;
  DestinationStationID?: string;
  DestinationStationName?: NameType;
  ServiceStatus?: number;
  EstimateTime?: number | null;
  SrcUpdateTime?: string;
  UpdateTime?: string;
};

export type ServiceDay = {
  ServiceTag?: string | null;
  Monday: boolean;
  Tuesday: boolean;
  Wednesday: boolean;
  Thursday: boolean;
  Friday: boolean;
  Saturday: boolean;
  Sunday: boolean;
  NationalHolidays: boolean;
};

export type StationTimeTable = {
  RouteID?: string | null;
  LineID: string;
  StationID: string;
  StationName?: NameType;
  Direction?: number | null;
  DestinationStaionID?: string;
  DestinationStationID?: string;
  DestinationStationName?: NameType;
  Timetables: Array<{
    Sequence: number;
    TrainNo: string;
    ArrivalTime: string;
    DepartureTime: string;
  }>;
  ServiceDay: ServiceDay;
  SpecialDays?: Array<unknown> | null;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

function credentials() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  return {
    clientId: runtimeEnv.TDX_CLIENT_ID,
    clientSecret: runtimeEnv.TDX_CLIENT_SECRET,
  };
}

export function hasTdxCredentials(): boolean {
  const { clientId, clientSecret } = credentials();
  return Boolean(clientId && clientSecret);
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) {
    throw new Error('TDX credentials are not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`TDX token request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000,
  };

  return payload.access_token;
}

async function tdxGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${API_BASE}/${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('$format', 'JSON');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TDX request failed: ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}

export async function getLiveBoard(stationID: string): Promise<LiveBoard[]> {
  return tdxGet<LiveBoard[]>('LiveBoard/TRTC', {
    '$filter': `StationID eq '${stationID}'`,
  });
}

export async function getStationTimeTable(stationID: string): Promise<StationTimeTable[]> {
  return tdxGet<StationTimeTable[]>('StationTimeTable/TRTC', {
    '$filter': `StationID eq '${stationID}'`,
  });
}
