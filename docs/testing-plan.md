# 測試驗證計畫 Test Plan（Phase 1–4）

## 階段必測場景與完成度 Phased Coverage & Status

| Phase | 必測場景 / Required Scenarios | 完成度 / Status | 缺口 / Gaps |
| --- | --- | --- | --- |
| Phase 1 – MVP（線上直連 / Online Direct） | 1) 端對端加密簽章後直連 `/api/sos`、`/api/status` 成功<br>2) 無網路時正確切換到 BLE 模式不中斷 UI 操作<br>3) GPS 權限與定位精度回傳（含多語系提示） | 主要實作已存在（路線圖列出 SOS/安全流程、線上/離線切換與在地化皆完成）<br>Core flows implemented (SOS/status, online/offline switch, localization done) | 缺少自動化回歸腳本與真機網路切換覆蓋<br>Missing automation and real-device network-switch coverage |
| Phase 2 – BLE 單跳中繼 / Single-Hop Relay | 1) Peripheral 廣播 + Central 掃描/連線/特徵值寫入<br>2) 120-byte 分片與重組成功並可上傳伺服器<br>3) 斷線後自動取消連線、不殘留廣播 | BLE 廣播、掃描、分片/重組與通知流程已在行動端實作；已有雙機手動劇本<br>BLE advertising/scan, chunking/reassembly done; manual two-device playbook exists | 缺少自動化回歸腳本、異常（半途斷線）覆蓋與伺服端驗證<br>Need automation, mid-transfer failure coverage, and server-side validation |
| Phase 3 – 多跳、重送/去重 / Multi-hop Retry & Dedupe | 1) TTL 控制下的多跳轉發與佇列重送<br>2) 裝置端去重視窗 + 伺服端 hash 去重<br>3) 佇列重試與丟棄條件 | Mesh 包裝/解包、TTL、佇列重送、行動端去重與伺服端 hash 去重均已存在<br>Mesh wrap/unwrap, TTL, queue retry, device+server dedupe implemented | 尚無跨三裝置的系統測試；需驗證 TTL 過期與佇列退避參數<br>No tri-device system test; need TTL expiry and retry backoff validation |
| Phase 4 – 親友查詢與通知 / Family Query & Push | 1) `/status` 單/批量查詢回傳最新紀錄<br>2) `/history/:uid` 依 `limit` 取回歷史<br>3) 狀態更新觸發推播並清理無效 Token | API、歷史查詢與 FCM 推播／Token 修剪邏輯已實作<br>APIs, history queries, FCM push and token pruning implemented | 未有端到端推播驗證與資料庫驗收腳本；需補授權/權限相關測試<br>Missing end-to-end push verification, DB acceptance script, and auth/permission tests |

## Regression Script（Phase 2–4）回歸腳本

### BLE 多跳（Phase 3） / Multi-hop BLE
1. **前置 / Prep**：準備三台裝置（A/B/C），A 無網路、B 無網路、C 有網路。A 產生 SOS（帶長備註以產生多分片）。
2. **步驟 / Steps**：
   - A 執行 `broadcastSOS`，等待 B 連線取得分片。
   - B 無網路，檢查 `MeshRouter.unwrap` TTL > 0 後呼叫 `enqueueRebroadcast` 並開始佇列，再廣播給 C。
   - C `scanReceiveAndUpload` 後判斷有網路，直接送 API。
3. **驗證 / Verify**：
   - B/C 日誌出現 `ble_relay_rebroadcast`、`ble_queue_send`、`ble_relay_upload`。
   - 伺服端紀錄 `relay_meta` 含 hops 路徑，TTL 遞減至 0。

### 重送 / 去重（Phase 3） Retry & De-duplication
1. **前置 / Prep**：兩台裝置 A/B，B 斷網會重播；伺服端開啟重覆 hash 記錄。
2. **步驟 / Steps**：
   - A 向 B 傳送相同 SOS 兩次（第二次在 2 分鐘內）。
   - B 無網路時佇列兩筆，再次廣播。
   - 伺服端收到後透過 `MeshService.isDuplicate` 判定。
3. **驗證 / Verify**：
   - 行動端 `seenPayloads` 去重命中，第二次不再入佇列。
   - 伺服端回傳 `duplicate:true`，資料表未新增新列。

### 推播通知（Phase 4） Push Notification
1. **前置 / Prep**：使用測試用戶註冊 FCM token，確認 DB `contact_tokens` 已建立。
2. **步驟 / Steps**：
   - 呼叫 `/api/status` 送出狀態更新；觸發 `NotificationService.sendPush`。
   - 模擬一組失效 Token，預期伺服端清除。
3. **驗證 / Verify**：
   - FCM 回應成功；日誌有 `notify_sent`；失效 Token 被移除。
   - 行動端收到推播 payload（含 uid/status）。

### 歷史查詢（Phase 4） History Queries
1. **前置 / Prep**：為同一 UID 插入 3 筆時間戳不同的 SOS/Status 紀錄。
2. **步驟 / Steps**：
   - 呼叫 `/api/status/:uid` 應回傳最新一筆。
   - 呼叫 `/api/history/:uid?limit=2` 需按時間倒序回傳 2 筆，包含 relay meta。
3. **驗證 / Verify**：
   - 兩個 endpoint 回傳的 `relay_meta` / 位置欄位與 DB 一致，無越權資料。

## 優先順序與責任人 Priority & Ownership

1. **Phase 3 多跳 & 去重** – 風險最高且缺少跨三裝置驗證；優先由 **Mobile QA（iOS/Android）** 與 **Backend QA** 聯合執行，確保 TTL/佇列/去重協同。
2. **Phase 2 單跳回歸** – 先由 **Mobile QA** 依既有雙機劇本重跑，建立多跳前的基線。
3. **Phase 4 通知與歷史** – 由 **Backend QA** 驗證 API/DB/推播，並請 **Mobile QA** 實機確認通知展示。
4. **Phase 1 直連與權限** – **Integration QA** 做線上/離線切換與權限提示煙囪測試，確保基礎功能未回退。
