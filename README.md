# 🚇 橘線開票所 / Orange Line Election Center

> 您的終點，由民主決定。

一個以臺北捷運中和新蘆線「蘆洲 vs. 迴龍」為題材的非官方迷因網站。使用者選擇剛上車的共同區間車站，網站以假開票動畫呈現該班列車推定的真正目的地。

**這是 parody / 非官方娛樂作品，與臺北捷運公司、TDX 或任何選務機關無關。實際列車資訊請以臺北捷運現場資訊為準。**

## MVP

- 上車站：O01 南勢角～O12 大橋頭
- 方向：往蘆洲／迴龍
- 判定順序：
  1. TDX `LiveBoard/TRTC`：若選定站下一班列車 ETA <= 1 分鐘，直接採用目的站
  2. TDX `StationTimeTable/TRTC`：以台北時間找距現在最近的發車班次，偏向「剛剛已發車」
  3. 若未設定金鑰或查詢失敗：deterministic demo mode
- 前端：假選務開票動畫；最後刻意收斂成「1 : 0」有效票
- i18n：文案集中在 `src/i18n/zh-TW.ts`，預留英文／日文／韓文版本

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

填入：

```env
TDX_CLIENT_ID=...
TDX_CLIENT_SECRET=...
ORANGE_LINE_DEMO=false
```

TDX Client Secret 僅在 server-side 使用，**不要送到瀏覽器，也不要 commit `.dev.vars`**。

## Cloudflare Workers

本專案使用 Astro 7 SSR + `@astrojs/cloudflare`，部署目標為 Cloudflare Workers。TDX secrets 由 Workers runtime 的 `cloudflare:workers` `env` 讀取，不會打包進瀏覽器端。

```bash
npm install
npm run build
npx wrangler login
npx wrangler secret put TDX_CLIENT_ID
npx wrangler secret put TDX_CLIENT_SECRET
npx wrangler deploy
```

若要暫時強制 demo mode：

```bash
npx wrangler secret put ORANGE_LINE_DEMO
```

值設為 `true` 即可。

正式部署也可以在 Cloudflare Dashboard 將 GitHub repository 連到 Workers Builds；主分支 push 後自動 build/deploy。

## GitHub repository

建議公開 repository：

```text
PichuChen/orange-line-election
```

建議 Description：

```text
🚇 您的終點，由民主決定。臺北捷運中和新蘆線「蘆洲 vs. 迴龍」非官方迷因開票所。
```

## TDX endpoints

- OAuth token: `https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`
- LiveBoard: `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/LiveBoard/TRTC`
- StationTimeTable: `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/StationTimeTable/TRTC`

## Roadmap

1. TDX 真實資料實測與 destination / RouteID 校正
2. recent-event cache，改善「列車剛離站」判定
3. 國定假日 / SpecialDays 服務日判斷
4. English / 日本語 / 한국어
5. 分享圖與「今日總開票結果」
6. Open Graph / Threads 分享最佳化

## License

MIT
