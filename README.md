# 🚇 橘線開票所 / Orange Line Election Center

> 您的終點，由民主決定。

一個以臺北捷運中和新蘆線「蘆洲 vs. 迴龍」為題材的非官方迷因網站。使用者選擇剛上車的共同區間車站，網站以假開票動畫呈現該班列車推定的真正目的地。

**這是 parody / 非官方娛樂作品，與臺北捷運公司或任何選務機關無關。實際列車資訊請以臺北捷運現場資訊為準。**

## MVP

- 上車站：O01 南勢角～O12 大橋頭
- 方向：往蘆洲／迴龍
- 班次資料：臺北捷運公司公開的中和新蘆線站別時刻表
- 判定方式：以臺北時間尋找最接近、並略偏向「剛剛已離站」的官方預定班次
- 若官方資料暫時無法取得：deterministic demo mode
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

目前公開資料沒有「每一班列車的實際載客人數」，所以不會假裝有。

臺北捷運有公開「每日分時各站 OD 流量」，後續會用它建立**歷史人流推估模型**：

1. 依星期類型與小時彙整 OD 流量。
2. 推估通過中和新蘆線共同區間某斷面的北向旅客量。
3. 再用該小時官方班次數換算成單班估計載客量。
4. 顯示為「推估票數」，不是即時、也不是逐班實測。

在模型完成前，開票動畫仍以 1 : 0 當作迷因 fallback。

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
3. 由官方每日分時 OD 產生每班 `estimatedVoters`
4. 國定假日服務日判斷
5. English / 日本語 / 한국어
6. Open Graph / Threads 分享最佳化

PR、Issue 都歡迎，畢竟開票系統也需要民間監票（？）

## License

MIT
