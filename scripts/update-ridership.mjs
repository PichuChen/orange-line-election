import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const INDEX_URL = 'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=eb481f58-1238-4cff-8caa-fa7bb20cb4f4';
const OUTPUT = 'src/data/ridership-profile.json';

const COMMON = [
  ['O01', '南勢角'],
  ['O02', '景安'],
  ['O03', '永安市場'],
  ['O04', '頂溪'],
  ['O05', '古亭'],
  ['O06', '東門'],
  ['O07', '忠孝新生'],
  ['O08', '松江南京'],
  ['O09', '行天宮'],
  ['O10', '中山國小'],
  ['O11', '民權西路'],
  ['O12', '大橋頭'],
];

const BRANCH_DESTINATIONS = [
  '台北橋', '菜寮', '三重', '先嗇宮', '頭前庄', '新莊', '輔大', '丹鳳', '迴龍',
  '三重國小', '三和國中', '徐匯中學', '三民高中', '蘆洲',
];

function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      out.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  out.push(field.replace(/\r$/, ''));
  return out;
}

function dayKind(dateText) {
  const [year, month, day] = dateText.split(/[\/-]/).map(Number);
  if (!year || !month || !day) return null;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6 ? 'holiday' : 'weekday';
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function latestResource() {
  const response = await fetch(INDEX_URL);
  if (!response.ok) throw new Error(`OD index request failed: ${response.status}`);
  const lines = (await response.text()).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = splitCsvLine(lines.shift());
  const yearIndex = header.indexOf('西元年');
  const monthIndex = header.indexOf('月');
  const urlIndex = header.indexOf('URL');
  if (yearIndex < 0 || monthIndex < 0 || urlIndex < 0) throw new Error('OD index schema changed');

  const rows = lines.map(splitCsvLine).filter((row) => row[urlIndex]);
  rows.sort((a, b) => Number(a[yearIndex]) - Number(b[yearIndex]) || Number(a[monthIndex]) - Number(b[monthIndex]));
  const latest = rows.at(-1);
  return {
    sourceMonth: monthKey(Number(latest[yearIndex]), Number(latest[monthIndex])),
    url: latest[urlIndex].replace(/^http:/, 'https:'),
  };
}

function emptyAccumulator() {
  const make = () => Object.fromEntries(COMMON.map(([id]) => [id, Array(24).fill(0)]));
  return { weekday: make(), holiday: make() };
}

async function buildProfile(resource) {
  const response = await fetch(resource.url);
  if (!response.ok || !response.body) throw new Error(`OD monthly request failed: ${response.status}`);

  const totals = emptyAccumulator();
  const dates = { weekday: new Set(), holiday: new Set() };
  const commonIndex = new Map(COMMON.map(([, name], index) => [name, index]));
  const northDestinations = COMMON.map((_, index) => new Set([
    ...COMMON.slice(index + 1).map(([, name]) => name),
    ...BRANCH_DESTINATIONS,
  ]));

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let header = null;
  let indices = null;

  const consume = (line) => {
    if (!line.trim()) return;
    const values = splitCsvLine(line.replace(/^\uFEFF/, ''));
    if (!header) {
      header = values;
      indices = {
        date: header.indexOf('日期'),
        hour: header.indexOf('時段'),
        origin: header.indexOf('進站'),
        destination: header.indexOf('出站'),
        count: header.indexOf('人次'),
      };
      if (Object.values(indices).some((index) => index < 0)) throw new Error(`OD monthly schema changed: ${header.join(',')}`);
      return;
    }

    const date = values[indices.date];
    const kind = dayKind(date);
    const hour = Number(values[indices.hour]);
    if (!kind || !Number.isInteger(hour) || hour < 0 || hour > 23) return;
    dates[kind].add(date);

    const origin = values[indices.origin];
    const destination = values[indices.destination];
    const riders = Number(values[indices.count]);
    const originIndex = commonIndex.get(origin);
    if (originIndex === undefined || !Number.isFinite(riders) || riders <= 0) return;

    for (let segment = originIndex; segment < COMMON.length; segment += 1) {
      if (!northDestinations[segment].has(destination)) continue;
      const stationID = COMMON[segment][0];
      totals[kind][stationID][hour] += riders;
    }
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) consume(line);
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);

  for (const kind of ['weekday', 'holiday']) {
    const divisor = dates[kind].size;
    if (!divisor) continue;
    for (const [stationID] of COMMON) {
      totals[kind][stationID] = totals[kind][stationID].map((value) => Number((value / divisor).toFixed(1)));
    }
  }

  return {
    sourceMonth: resource.sourceMonth,
    generatedAt: new Date().toISOString(),
    method: 'orange-line-od-lower-bound',
    limitation: 'Only Orange Line OD pairs that definitely cross the selected northbound common segment are counted; transfer passengers are not fully represented.',
    weekday: totals.weekday,
    holiday: totals.holiday,
  };
}

const resource = await latestResource();
console.log(`Using Taipei Metro OD ${resource.sourceMonth}: ${resource.url}`);
const profile = await buildProfile(resource);
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(profile, null, 2)}\n`);
console.log(`Wrote ${OUTPUT}`);
