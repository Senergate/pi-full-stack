# Senergate pi-full-stack AI Grid Merge Notes / 合并说明

## Deutsch

Diese Version verbindet `pi-full-stack_simulation_real_ai_grid(3)` mit den sicheren Steuersemantiken aus `pi-full-stack_merged`.

Umgesetzt:

1. `pi-full-stack_simulation_real_ai_grid(3)` bleibt die Rechen- und Anzeige-Basis: `SimulationRuntime`, SIMULATION/REAL-HARDWARE-Umschaltung, Grid-Impedance-Panel, raw/measured/projected-Trennung und fail-closed VUF-Eingänge bleiben erhalten.
2. Die Netzwerk-Konfiguration bleibt wie in Version A: `App.js` nutzt weiterhin den Pi5 Socket.IO Endpoint `10.20.0.200:4000`, `server/config.js` bleibt auf `pi_ip=10.20.0.200`, HTTP-Port `4000`, MQTT-Port `1883`.
3. Branch-A Heatpump-Semantik aus Version A wurde wiederhergestellt: `OFF -> stop,0`, `ZERO HOLD -> start,0`, `RUN -> start,<legacy-normalized-load*10>`.
4. `AgentCard.vue` enthält wieder COMMAND-PENDING-Anzeige, Pending-Markierung pro Device, ZERO-HOLD-Button und manuelle Sperre der Wallbox-Levelbuttons im Auto-Modus.
5. `SimpleDashboard.vue` übergibt den Heatpump-Command-Mode bis zum Server beziehungsweise zur Simulation.
6. `SimulationRuntime.EspService.heatpump(load, mode)` akzeptiert denselben Mode wie die reale Runtime, bleibt aber vollständig lokal und sendet kein MQTT.
7. `PhasorCalculator.buildCurrentPhasorsFromPF()` nutzt jetzt die jeweiligen `sourceAngles` als Spannungsreferenz, damit nicht-ideale Quellwinkel keine inkonsistente Zeigergeometrie erzeugen.
8. Jonas/A-Root-Dateien wurden wiederhergestellt: `.gitignore`, `.prettierrc`, `README.md`, `mango-router-recovery-guide.md`.

## 中文

这个版本把 `pi-full-stack_simulation_real_ai_grid(3)` 的运算/展示优势，与 `pi-full-stack_merged` 中更安全的控制语义合并。

已完成：

1. 以 `pi-full-stack_simulation_real_ai_grid(3)` 为运算和展示基础，保留 `SimulationRuntime`、SIMULATION/REAL HARDWARE 切换、Grid Impedance 面板、raw/measured/projected 分层和 VUF fail-closed 输入处理。
2. 网络配置继续选择 A：`App.js` 仍连接 Pi5 Socket.IO `10.20.0.200:4000`，`server/config.js` 保持 `pi_ip=10.20.0.200`、HTTP 端口 `4000`、MQTT 端口 `1883`。
3. 恢复 A 的 Branch-A Heatpump 控制语义：`OFF -> stop,0`，`ZERO HOLD -> start,0`，`RUN -> start,<legacy-normalized-load*10>`。
4. `AgentCard.vue` 恢复 COMMAND-PENDING 显示、每个设备的 pending 标记、ZERO-HOLD 按钮，以及 Auto 模式下锁定 Wallbox level 手动按钮。
5. `SimpleDashboard.vue` 把 heatpump command mode 传给真实 server 或本地 simulation。
6. `SimulationRuntime.EspService.heatpump(load, mode)` 接受与真实 runtime 一样的 mode，但仍然只在浏览器本地模型中执行，不发送 MQTT。
7. `PhasorCalculator.buildCurrentPhasorsFromPF()` 现在使用对应相的 `sourceAngles` 作为电压参考，避免非理想电压角下电流相量几何不一致。
8. 恢复 Jonas/A 根目录文件：`.gitignore`、`.prettierrc`、`README.md`、`mango-router-recovery-guide.md`。

## Test

Neue zusätzliche Tests:

- `tests/merged_control_semantics_test.mjs`

Bestehende Tests aus Version B bleiben erhalten:

- `tests/bugfix3_smoke_test.mjs`
- `tests/simulation_runtime_test.mjs`
- `tests/simulation_ai_grid_test.mjs`
