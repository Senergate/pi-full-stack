# Senergate pi-full-stack · Bugfix 3

## 中文

本版本只集中修复三个优先问题，不重构整体架构：

1. **Shelly 原始测量值与 Digital Twin 投影分离**
   - 不再原地修改 Socket.IO/Shelly payload。
   - `raw`：原始数据快照。
   - `measured`：仅执行零点校准后的测量层。
   - `projected`：显式执行 800/400/230 倍率后的 `SCALED FROM MEASURED` 层。
   - `CurrentCard` 明确显示 `SCALED FROM MEASURED · Digital Twin`。

2. **`null` 不再被解释为 `0 A` / `0 % VUF`**
   - `null` / `undefined` / 空字符串统一保持为不可用值。
   - CUF/VUF 缺输入时返回 `null + error`，Fail Closed。
   - VUF 卡片显示 `NO DATA`，不再显示 `0.0% BALANCED`。
   - Agent 在当前 VUF 或预测 VUF 不可用时不把它当成 0%。

3. **Battery Charging / Discharging 语义统一**
   - 当前物理 Branch C：`charging=true -> Shelly ON`，`charging=false -> Shelly OFF`。
   - 物理状态变量统一命名为 `charging`。
   - Battery discharge 保留给 Digital Twin，不再与物理 Shelly Boolean 混用。

回归测试：

```bash
node tests/bugfix3_smoke_test.mjs
```

预期：`bugfix3 smoke tests: PASS`

## Deutsch

Diese Version behebt gezielt drei priorisierte Fehler, ohne die Gesamtarchitektur umzubauen:

1. **Trennung von Shelly-Messwerten und Digital-Twin-Projektion**
   - Der Socket.IO-/Shelly-Payload wird nicht mehr in-place verändert.
   - `raw`: unveränderter Eingangssnapshot.
   - `measured`: Messschicht nach Nullpunktkalibrierung.
   - `projected`: explizite 800/400/230-Projektion als `SCALED FROM MEASURED`.
   - `CurrentCard` ist entsprechend gekennzeichnet.

2. **`null` wird nicht mehr zu `0 A` bzw. `0 % VUF`**
   - Fehlende Werte bleiben ungültig.
   - CUF/VUF liefern bei fehlenden Eingängen `null + error` (Fail Closed).
   - Die VUF-Karte zeigt `NO DATA` statt `0.0% BALANCED`.
   - Auch der Agent behandelt fehlende aktuelle oder vorhergesagte VUF-Werte nicht als 0%.

3. **Eindeutige Battery-Semantik**
   - Physischer Branch C: `charging=true -> Shelly ON`, `charging=false -> Shelly OFF`.
   - Der physische Zustand heißt durchgängig `charging`.
   - Discharge bleibt Digital-Twin-only und wird nicht mit dem physischen Boolean vermischt.

Regressionstest:

```bash
node tests/bugfix3_smoke_test.mjs
```

Erwartet: `bugfix3 smoke tests: PASS`
