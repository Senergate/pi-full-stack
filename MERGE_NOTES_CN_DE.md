# Senergate pi-full-stack Merge Notes / Zusammenführungsnotizen (CN/DE)

## 德语任务重述 / Präzisierte Aufgabenstellung
`pi-full-stack(3).zip` wird als fehlerfreie Hauptbasis verwendet und mit ausgewählten Elementen aus `pi-full-stack_Jonas.zip` zusammengeführt. Die bestätigten Entscheidungen des Users waren: `1C, 2A, 3C, 4A, 5B, 6A, 7C`.

## 合并基线 / Merge-Basis
- 主版本 / Hauptbasis: `pi-full-stack(3).zip`
- 参考版本 / Referenz: `pi-full-stack_Jonas.zip`
- 输出 / Ausgabe: `pi-full-stack_merged.zip` + `pi-full-stack_merged_vs_base3.patch`

## 已执行的合并决定 / Umgesetzte Entscheidungen

### 1C — AgentCard：当前 UI + pending + predicted
中文：保留当前版本的 Frontstage UI 和 predicted VUF 展示，同时恢复 Jonas 版本的 pending 思想：命令发出后，设备卡片会以黄色 pending 状态显示，直到实际反馈状态追上目标状态。

Deutsch: Die aktuelle Frontstage-UI und die Predicted-VUF-Anzeige bleiben erhalten. Zusätzlich wird die Pending-Idee aus Jonas wieder eingeführt: Nach einem Kommando markiert die Gerätekarte den Zustand als pending, bis der gemeldete Ist-Zustand den Zielzustand erreicht.

### 2A — Battery：relay ON = charging
中文：后端 `BatteryService.set(charging)` 现在明确表示 `true = charging = Shelly relay ON`。前端也统一使用 `battery.charging`，避免 `charging/discharging` 反向布尔语义。

Deutsch: `BatteryService.set(charging)` bedeutet nun eindeutig `true = charging = Shelly relay ON`. Das Frontend nutzt ebenfalls `battery.charging`.

### 3C — Heatpump OFF 与 ZERO_HOLD 分开
中文：`OFF` 发送 `stop,0`；`ZERO HOLD` 单独发送 `start,0`。服务端 `EspService.heatpump(load, mode)` 支持 `mode='stop' | 'zero_hold' | 'start'`。

Deutsch: `OFF` sendet `stop,0`; `ZERO HOLD` sendet explizit `start,0`. Der Server unterstützt `EspService.heatpump(load, mode)`.

### 4A — Wallbox 继续直接 Shelly 控制
中文：保持当前 demo 路径 `WallboxService.set()` → Shelly MQTT，不切换到 ESP32 Branch-B Agent。

Deutsch: Der direkte Demo-Pfad über `WallboxService.set()` und Shelly MQTT bleibt erhalten.

### 5B — raw/scaled 分离，但 UI 仍显示 demoScaled
中文：`SimpleDashboard.vue` 现在保留 `energy_meter.rawData`，同时生成 `energy_meter.demoScaled`。UI 使用 demoScaled；旧字段 `energy_meter.data` 仅作为兼容别名。

Deutsch: `SimpleDashboard.vue` behält `energy_meter.rawData` und erzeugt separat `energy_meter.demoScaled`. Die UI zeigt demoScaled; `energy_meter.data` bleibt nur ein Kompatibilitätsalias.

### 6A — 恢复 Jonas 根目录文档
中文：恢复 `.gitignore`、`.prettierrc`、`README.md`、`mango-router-recovery-guide.md`。同时 `.gitignore` 补充 `*.zip`、`node_modules/`、`dist/`、`build/`，防止再次提交嵌套压缩包或构建产物。

Deutsch: `.gitignore`, `.prettierrc`, `README.md` und `mango-router-recovery-guide.md` wurden wiederhergestellt. `.gitignore` wurde um generierte Artefakte ergänzt.

### 7C — 输出完整 zip + patch
中文：同时提供完整合并版 zip 和相对 `pi-full-stack(3).zip` 的 patch/diff 文件。

Deutsch: Es gibt sowohl ein komplettes ZIP als auch einen Patch gegen `pi-full-stack(3).zip`.

## 重点修改文件 / Wichtig geänderte Dateien
- `client/src/components/AgentCard.vue`
- `client/src/components/SimpleDashboard.vue`
- `server/BatteryService.js`
- `server/EspService.js`
- `client/src/components/CurrentCard.vue`
- `.gitignore`

## 注意 / Hinweise
中文：这个合并版本保持 Wallbox direct-Shelly demo 路径。若之后要进入正式 Senergate 架构，应把 Wallbox 统一到 ESP32 Branch-B Agent，并引入 ACK/status/execution truth。

Deutsch: Diese Version behält den direkten Shelly-Demo-Pfad für die Wallbox. Für die Zielarchitektur sollte später auf ESP32 Branch-B Agent, ACK, Status und Execution Truth umgestellt werden.
