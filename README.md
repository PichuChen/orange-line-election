# 🚇 橘線開票所 / Orange Line Election Center

> 您的終點，由民主決定。

一個以臺北捷運中和新蘆線「蘆洲 vs. 迴龍」為題材的非官方迷因網站。使用者選擇剛上車的共同區間車站，網站以假開票動畫呈現該班列車推定的真正目的地。

**這是 parody / 非官方娛樂作品，與臺北捷運公司或任何選務機關無關。實際列車資訊請以臺北捷運現場資訊為準。**

## MVP

- 上車站：O01 南勢角～O12 大橋頭
- 方向：往蘆洲／迴龍
- 班次資料：臺北捷運公司公開的中和新蘆線站別時刻表
- 判定方式：以臺北時間尋找最接近、並略偏向「剛剛已離站」的官方預定班次
- 推估票數：官方每日分時 OD 流量 × 該小時官方班次數的保守下限模型
- 若官方班表暫時無法取得：deterministic demo mode
- i18n：預留 English / 日本語 / 한국어

## 官方資料來源

目前不需要 TDX Client ID / Client Secret。

班次判定直接讀取臺北捷運公司在臺北市資料大平臺公開的「臺北捷運站別時刻表資料服務」：

- 中和新蘆線平日時刻表
- 中和新蘆線假日時刻表
- 主要欄位包含 `StationID`、`DestinationStationName`、`DepartureTimes`、`EffectiveDate`

凌晨 00:00～03:59 會視為前一個捷運服務日。國定假日的額外判斷仍在 roadmap。

另外，臺北捷運也有公開每 30 秒更新的「列車到站站名」資料，後續可拿來做即時校正。

## 票數怎麼來？

公開的常態資料並不是逐班實際載客數，因此網站只顯示**推估選民數／推估票數**。

每月由 GitHub Action 讀取臺北捷運最新的「每日分時各站 OD 流量」CSV，產生 `src/data/ridership-profile.json`。線上 Worker 不會在每次請求時下載大型 OD 原始檔。

目前採用 `orange-line-od-lower-bound` 模型：

1. 對 O01～O12 每一站，計算該站往北斷面在每個小時的歷史平均人流。
2. 只納入「進站與出站都能確定屬於橘線，且確定會通過該斷面」的 OD pair。
3. 依平日／週末分開平均。
4. Runtime 再用該站該小時往蘆洲＋迴龍的官方班次數相除，得到單班推估人數。
5. 開票動畫最後讓實際目的地陣營取得該推估票數，另一陣營為 0 票。

概念上：

```text
推估本班選民數 ≈ 該時段通過所選斷面的歷史平均人流 ÷ 該時段官方班次數
```

### 限制

這是一個**刻意保守的下限模型**，不是本班列車實測載客量：

- 跨線轉乘旅客沒有被完整納入。
- 目前用週末近似假日，尚未套入國定假日服務日曆。
- 同一小時內各班以平均方式分配，沒有假設每班載客完全相同。
- 歷史 OD 為月度資料，不代表當下即時擁擠程度。

因此 UI 必須保留「推估」與資料月份標示，不能把它描述成逐班實際人數。

## 更新 OD profile

手動更新：

```bash
node scripts/update-ridership.mjs
```

也可以在 GitHub Actions 執行 **Update ridership profile**。Workflow 每月 12 日會自動檢查最新官方月份，若 profile 有變更就 commit 回 repository。

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

若要強制 demo mode：

```env
ORANGE_LINE_DEMO=true
```

## Cloudflare Workers

```bash
npm install
npm run build
npx wrangler deploy
```

也可以在 Cloudflare Dashboard 將 GitHub repository 連到 Workers Builds，讓 `main` push 後自動部署。

## Roadmap

1. 官方時刻表 CSV parser 實車驗證
2. 官方「列車到站站名」30 秒資料做即時校正
3. 國定假日服務日判斷
4. 研究可合法持續取得的即時擁擠度校正來源
5. English / 日本語 / 한국어
6. Open Graph / Threads 分享最佳化

PR、Issue 都歡迎，畢竟開票系統也需要民間監票（？）

## License

MIT
