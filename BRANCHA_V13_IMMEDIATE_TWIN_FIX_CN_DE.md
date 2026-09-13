# Branch A v1.3 – Immediate Building-Twin Command Projection Fix
# Branch A v1.3——Building Twin 命令即时投影修复

## Problem / 问题

v1.2 speicherte `start,30`/`start,50` zwar in `_.heatpump.commanded`, aktualisierte `_.heatpump.twinLevel` aber erst beim nächsten Branch-A-Status. Wenn der ESP32-Status nicht sofort neu veröffentlicht wurde, blieb L1 im Building Twin bei 0 A.

v1.2 虽然会把 `start,30` / `start,50` 保存到 `_.heatpump.commanded`，但只有在下一条 Branch-A status 到达时才重新计算 `twinLevel`。如果 ESP32 没立即刷新 status，Building Twin 的 L1 就一直保持 0 A。

## Fix / 修复

`sendHeatpumpCommand()` setzt jetzt unmittelbar die MODELED command trajectory:

- `start,30` -> `twinLevel=3` -> L1 = 21 A
- `start,50` -> `twinLevel=5` -> L1 = 35 A
- `zero_hold` -> `twinLevel=0`
- `stop` -> `twinLevel=0`

Der bestätigte Ausführungszustand `_.heatpump.level` bleibt weiterhin ausschließlich status-/RFRD-basiert. Ein gesendeter Befehl wird daher NICHT als physisch ausgeführt angenommen.

现在 `sendHeatpumpCommand()` 会立即更新 MODELED command trajectory，但真实确认状态 `_.heatpump.level` 仍然只由 ESP32 status / RFRD 驱动，因此不会把“命令已发送”误当成“物理执行完成”。

Wenn das Backend den Befehl ablehnt oder der RPC fehlschlägt, wird die optimistische Twin-Projektion auf den vorherigen Wert zurückgesetzt. Eine Generation-ID verhindert, dass eine verspätete Antwort eines älteren Befehls einen neueren Befehl zurückrollt.

如果 Backend 拒绝命令或 RPC 失败，Twin 投影会回滚到之前的值；generation ID 防止旧命令的延迟响应覆盖更新的命令。

## Deployment check / 部署确认

Die UI zeigt jetzt sichtbar:

`v1.3-branchA-command-projection-sync`

如果页面看不到这个版本号，就说明 Pi5 仍然在运行旧 Vite 前端。

Außerdem enthält v1.3 weiterhin keinen festen 12-s-Confirmation-Timeout. Falls die UI weiterhin `confirm window 12 s` zeigt, stammt die Seite eindeutig aus einem älteren Build/Prozess/Browser-Cache.

v1.3 继续不包含固定的 12 秒确认超时。如果页面还显示 `confirm window 12 s`，则可以确定仍然加载的是旧前端。

## UI semantics / UI语义

Wenn der Building Twin während `STARTING` den aktiven Befehl projiziert, wird die Quelle als `COMMAND TRAJECTORY (execution pending)` gekennzeichnet. Sobald der reale Status den Level bestätigt, wechselt die Anzeige zurück zu `REAL execution state`.

当 STARTING 阶段的 Building Twin 使用命令轨迹时，界面会明确显示 `COMMAND TRAJECTORY (execution pending)`；真实状态确认后再恢复为 `REAL execution state`。
