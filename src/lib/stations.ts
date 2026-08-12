export type Station = {
  id: string;
  zh: string;
  en: string;
};

// Shared section before the Zhonghe–Xinlu Line splits toward Luzhou / Huilong.
export const COMMON_STATIONS: Station[] = [
  { id: 'O01', zh: '南勢角', en: 'Nanshijiao' },
  { id: 'O02', zh: '景安', en: 'Jingan' },
  { id: 'O03', zh: '永安市場', en: 'Yongan Market' },
  { id: 'O04', zh: '頂溪', en: 'Dingxi' },
  { id: 'O05', zh: '古亭', en: 'Guting' },
  { id: 'O06', zh: '東門', en: 'Dongmen' },
  { id: 'O07', zh: '忠孝新生', en: 'Zhongxiao Xinsheng' },
  { id: 'O08', zh: '松江南京', en: 'Songjiang Nanjing' },
  { id: 'O09', zh: '行天宮', en: 'Xingtian Temple' },
  { id: 'O10', zh: '中山國小', en: 'Zhongshan Elementary School' },
  { id: 'O11', zh: '民權西路', en: 'Minquan W. Rd.' },
  { id: 'O12', zh: '大橋頭', en: 'Daqiaotou' },
];

export function isSupportedStation(id: string): boolean {
  return COMMON_STATIONS.some((station) => station.id === id);
}
