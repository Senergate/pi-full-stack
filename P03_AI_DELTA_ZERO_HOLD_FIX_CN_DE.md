# P0-3 AI Delta Control + Heatpump ZERO_HOLD Fix / 修复说明

## 中文

本补丁仅处理已确认的 P0-3 设计：

- Digital Twin 继续用完整设备状态进行预测（Full State Prediction）。
- 实际执行前计算 Delta Patch，只发送真正变化的设备，避免未变化设备被重复下发。
- Heatpump 的 AI/level `0` 默认映射为 `ZERO_HOLD` (`start,0`)，不再隐式映射为 STOP。
- STOP 从 AI 优化状态空间中分离：只有手动 STOP 按钮或 ESP32 本地 Safety 路径能够进入 STOP。
- 手动按钮从 `OFF` 改名为 `STOP`，并保留独立的 `ZERO HOLD` 按钮。
- SimulationRuntime 现在分别保存 `heatpumpMode=stop|zero_hold|start`，避免 level=0 丢失状态语义。
- 调节参数：`MIN_IMPROVEMENT=0.10` 个百分点，`SETTLE_TIME_MS=10000`，超过 2.00% 持续 1 s 才触发，低于 1.90% 才释放调节状态。
- `TICK_MS=250` 保留，只负责快速监测，不代表 250 ms 执行动作。

## Deutsch

Dieser Patch behandelt ausschließlich das bestätigte P0-3-Design:

- Der Digital Twin bewertet weiterhin vollständige Gerätezustände (Full-State Prediction).
- Vor der Ausführung wird ein Delta Patch gebildet; nur tatsächlich geänderte Aktoren erhalten einen Befehl.
- Heatpump-Level `0` wird im AI-/Level-Pfad standardmäßig als `ZERO_HOLD` (`start,0`) interpretiert und nicht mehr implizit als STOP.
- STOP ist aus dem AI-Optimierungsraum getrennt: Nur der manuelle STOP-Befehl oder der lokale ESP32-Safety-Pfad darf STOP erzeugen.
- Der manuelle Button heißt jetzt `STOP`; `ZERO HOLD` bleibt ein eigener Befehl.
- SimulationRuntime hält `heatpumpMode=stop|zero_hold|start` separat, sodass Level 0 die Betriebssemantik nicht mehr verliert.
- Reglerparameter: `MIN_IMPROVEMENT=0.10` Prozentpunkte, `SETTLE_TIME_MS=10000`, Auslösung erst nach 1 s oberhalb 2.00%, Freigabe unterhalb 1.90%.
- `TICK_MS=250` bleibt als schnelle Überwachungsrate bestehen und ist keine Aktor-Schaltfrequenz.

## Unveränderte Branch-A-Invarianten / 保留的不变量

Die ESP32-Firmware wird durch diesen Patch nicht verändert. STOP-Override, ZERO_HOLD != STOP, Full-Restart nach STOP, RUN-Refresh-Guard und Modbus-Single-Owner bleiben unverändert. / 本补丁不修改 ESP32 固件，Branch-A 原有 STOP override、ZERO_HOLD != STOP、STOP 后 full restart、RUN refresh guard 和 Modbus single owner 不变量保持不变。
