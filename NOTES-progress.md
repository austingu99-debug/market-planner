# 開發進度筆記（供 agent 續作參考）

## 使用者提供的外部資料
- Google Drive 試算表：`市集時間軸.xlsx`
  - fileId: `1JrRlc-qfEQDmQ2rWRAH5Yk9pkGWOPrq_`
  - 原連結: https://docs.google.com/spreadsheets/d/1JrRlc-qfEQDmQ2rWRAH5Yk9pkGWOPrq_/edit?usp=drivesdk
  - mimeType: xlsx（63071 bytes），已下載至 `/home/ubuntu/import/timeline.xlsx`
  - 讀取指令：`gws drive files get --params '{"fileId":"...","alt":"media"}' --output <path>`
- 視覺參考圖：使用者上傳的「CIS 建立進度總覽」截圖
  - 米白暖底 + 襯線標題；每列＝項目 + 說明 + 狀態膠囊
  - 狀態三色：淡綠(已完成) / 淡卡其(進行中) / 淡灰(待定)
  - 已據此完成主題與 TaskRow 排版

## 使用者確認的決策
- 登入固定用 Manus OAuth（各自 Google 帳號，非共用帳號）
- 團隊固定 4 人；成員名單取前四位登入帳號
- AI 用使用者自己的 Groq API Key（已設定 GROQ_API_KEY）
- AI 匯入必須「先出草稿 → 可逐筆編輯 → 按確認才寫入」
- 分類六大類 + 新增「其他」可自行輸入名稱
- 偏好：AI 未來要能傳送/分析照片、支援多語言切換
- **多屆架構**：市集會辦多次，任務綁屆次；後面屆次標題先留空讓團隊自填
- 首場日期不訂，留空由團隊之後填
- 分類改為團隊組別（照試算表）＋保留自訂
- 時間軸要「簡單明瞭」：月份分段，每列只顯示標題／組別／狀態，點開才看細節

## 品牌資訊（來自試算表）
- 品牌名：《咻一下》SHIU；定位「慢生活 × 療癒 × 體驗市集」
- 首場預計 2027 年二月（日期未定）
- Linktree: https://linktr.ee/hangoutmarket
- 五組別：總策展與法律財務／美學與場域設計／招商與攤商關係／行銷與數位公關／營運執行與物流

## 已完成（多屆架構後端）
- `editions` 表已建立（name 可 null、ordinal、eventDate、note、isActive、archivedAt、createdById）
- `tasks.edition_id` 已新增（nullable）＋ index
- category enum 已改為 `curation` / `design` / `vendor` / `marketing` / `operation` / `other`
- `client/src/lib/taskMeta.ts` 的 CATEGORY_ORDER / LABELS / CODES 已更新為組別
- `server/db.ts`：getEditions / getActiveEdition / createEdition / updateEdition / setActiveEdition / deleteEdition / duplicateEditionTasks / editionDisplayName；getAllTasks、getTasksByAssignee、getTaskStats 皆支援 editionId；createTask 支援 editionId 與 status
- `server/routers/editions.ts` 已建立並註冊
- TaskDialog 預設分類改 curation
- `pnpm check` 通過

## 待辦（多屆架構前端起）
1. AppShell 加屆次切換下拉（顯示 editionDisplayName，切換即 setActive）
2. Home / Timeline 查詢帶 activeEdition.id；TaskDialog create 帶 editionId
3. Timeline 改月份分段簡潔版（📅 八月 → 任務列：標題／組別／狀態，點開看細節）
4. Settings 加屆次管理（新增、改名、改日期、複製上一屆任務範本）
5. 匯入試算表 → 建立「第一屆」→ 四組別任務（月份設截止日 2026-05~2027-03）；✅→done、70%→in_progress
6. 補助資訊與短中長期目標 → 資源專區
7. AI 檔案解析匯入（上傳→草稿→逐筆編輯→勾選→確認寫入）
8. 測試 + checkpoint

## 已完成（本階段）
- DB：tasks 加 `custom_category` / `notes` / `cloud_link`；category enum 加 `other`
- DB：新增 `task_attachments`、`resource_folders`、`resource_items` 三張表（已 SQL 建立並驗證）
- server/db.ts：任務新欄位、附件 CRUD、資源資料夾與項目 CRUD
- server/routers/tasks.ts：新欄位 + attachments / addAttachment / deleteAttachment
- server/routers/resources.ts：folders / items / addLink / addFile / update / delete
- routers.ts 已註冊 `resources`
- client/src/lib/taskMeta.ts：加 other、`categoryLabel()` / `categoryCode()` 支援自訂名稱
- TaskDialog：自訂分類欄、備註欄、雲端連結欄、附件上傳與刪除

## 已完成（前一階段）
- Home.tsx / Timeline.tsx / TaskRow.tsx 已適配新欄位
- Resources.tsx 資源頁已建立，AppShell 導覽改五格

## 環境
- 專案路徑 `/home/ubuntu/market-planner`
- 正式網址 https://marketplan-es4bvchf.manus.space
- 注意：`pnpm drizzle-kit generate` 曾卡住，改用 `webdev_execute_sql` 直接執行 DDL
- 試算表分頁純文字：`/home/ubuntu/import/sheets/*.txt`；匯入計畫 `/home/ubuntu/import/PLAN.md`

## 匯入完成狀態（2026-08-09 深夜）
- editions：id 1「第一屆 咻一下市集」(is_active=1, 99 tasks, event_date NULL)；id 2 / id 3 為空白待命名屆次（name NULL）
- 已刪除重複的 editions id 30001/30002/30003
- resource_folders 5 個：品牌與 CIS(6)、補助與資源(2)、目標與指標(2)、場地評估(3)、行銷素材(4)，共 17 筆
- resource_items.kind enum 已擴充為 ('file','link','note')
- 匯入腳本 `scripts/seed-edition1.mjs`（有 idempotent 檢查，已存在則跳過）
- 已登入成員：id 1 狗狗 QAQ（austingu99@gmail.com）、id 150001 阿科（curtis0955831336@gmail.com）

## 剩餘工作（依序）
1. **截圖時序問題（非真 bug）**：screenshot 常在資料回來前拍到 skeleton。
   DB 已確認：99 tasks(edition 1)、5 folders、17 items、3 editions。
   tRPC 請求皆成功回應（tasks.list 約 1.1~1.2s，editions.* 約 0.9~2.0s，無 4xx/5xx）。
   曾一度拍到 Timeline 正常顯示全部 99 筆（月份分段），證明前端邏輯正確。
   已修正兩頁 query key 穩定性（scope 恆為物件 `{editionId: editionId ?? -1}`，
   enabled 用 `editionId !== undefined`），並加上 error UI 與 activeQuery.isLoading 合併判斷。
   → 效能待優化：可考慮在 tasks.list / editions.* 減少 DB 往返或加 staleTime。
2. AI 匯入功能：上傳檔案 → Groq 解析 → 可逐筆編輯草稿 → 勾選 → 確認寫入
3. 寫 vitest 測試
4. checkpoint 並交付
