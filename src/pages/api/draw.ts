import type { APIRoute } from 'astro';
import { isSupportedStation } from '../../lib/stations';
import { resolveTrain } from '../../lib/resolveTrain';

export const POST: APIRoute = async ({ request }) => {
  let body: { stationID?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const stationID = body.stationID?.trim().toUpperCase() ?? '';
  if (!isSupportedStation(stationID)) {
    return new Response(JSON.stringify({ error: 'UNSUPPORTED_STATION' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const result = await resolveTrain(stationID);

  return new Response(JSON.stringify({ stationID, ...result }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
