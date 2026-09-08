# P0-1 / P0-2 Fix – DE/CN

## P0-1 – Einheitlicher VUF-KPI / 统一 VUF KPI

**DE:** `AgentCard` erhält jetzt denselben `currentVuf` wie die VUF-Karte. Auch die Kandidatenprognose `predictVufForDeviceState()` liefert den gesamten geschätzten VUF zurück. `loadImpactVuf` bleibt nur als Diagnose-/Breakdown-Wert in der VUF-Karte und wird nicht mehr gegen die 2-%-Agentenschwelle verglichen.

**中文：** `AgentCard` 现在与 VUF 卡片统一使用 `currentVuf`。候选预测 `predictVufForDeviceState()` 也返回总 Estimated VUF。`loadImpactVuf` 只保留用于诊断/拆分显示，不再与 Agent 的 2% 阈值比较。

## P0-2 – Kanonischer Heatpump-Befehl / 规范化 Heatpump 命令

**DE:** Für den aktuellen diskreten 5-Level-Pfad gilt nun ein striktes Paar: Level 1..5 entsprechen 10/20/30/40/50 Hz. Wenn `target_hz` fehlt, wird es aus `level` abgeleitet. Wenn es mitgeliefert wird und nicht zum Level passt, wird der Befehl mit `heatpump_level_target_mismatch` abgelehnt. Ungültige Levels werden nicht mehr still geklemmt. STOP und ZERO_HOLD bleiben unabhängig vom Eingabewert auf 0 Hz normalisiert.

**中文：** 当前离散 5 档控制采用严格配对：Level 1..5 分别对应 10/20/30/40/50 Hz。若未提供 `target_hz`，则由 `level` 推导；若同时提供但不一致，则以 `heatpump_level_target_mismatch` 拒绝。越界 level 不再被静默 clamp。STOP 与 ZERO_HOLD 继续强制归一化为 0 Hz。

## Regression Tests / 回归测试

- `tests/p0_1_agent_vuf_kpi_consistency_test.mjs`
- strengthened `tests/heatpump_command_contract_test.mjs`
- all existing tests remain required to PASS


## Anzeigepräzision / 显示精度

**DE:** Alle VUF-Anzeigewerte in `VufCard` und `AgentCard` werden einheitlich mit genau zwei Nachkommastellen dargestellt. Die Status-/Schwellwertlogik verwendet weiterhin die ungerundeten internen Werte; gerundet wird ausschließlich bei der Darstellung.

**中文：** `VufCard` 与 `AgentCard` 中的 VUF 显示统一为固定两位小数。状态判断和阈值比较仍使用未四舍五入的内部原始值，仅在界面显示层进行格式化。
