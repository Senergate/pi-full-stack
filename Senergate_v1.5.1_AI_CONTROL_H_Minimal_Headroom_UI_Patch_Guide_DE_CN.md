# Senergate v1.5.1 AI CONTROL H
## Minimal Headroom + UI Patch / Minimaler Headroom- und UI-Patch

### 1. Ziel / 目标

**DE:** Diese Version basiert direkt auf AI CONTROL G. Die Änderungen wurden bewusst klein gehalten: keine zweite Regelungs-State-Machine, keine Änderung der MQTT-Verträge und keine Änderung der Branch-A/Branch-B-Firmware. Capacity/Headroom verwendet weiterhin die Building-Twin-MODELED-Werte.

**中文：** 本版本直接基于 AI CONTROL G，并严格采用最小化修改方案：不新建第二套控制状态机、不修改 MQTT 合同、不修改 Branch A/Branch B 固件。Capacity/Headroom 继续以 Building Twin 的 MODELED 值为计算基础。

### 2. Capacity kann unabhängig von VUF auslösen / Capacity 可独立触发

**DE:** Die vorhandene Ausführungslogik wird weiterverwendet. Ein Regelzyklus kann jetzt durch `VUF violation OR Capacity >= Pre-Limit` ausgelöst werden. `COMMAND_PENDING -> EXECUTION_CONFIRMED -> SETTLING -> MONITORING` bleibt unverändert.

**中文：** 继续复用原有执行流程。现在控制触发条件为 `VUF 超限 OR Capacity >= Pre-Limit`。原有 `COMMAND_PENDING -> EXECUTION_CONFIRMED -> SETTLING -> MONITORING` 不变。

### 3. Candidate Capacity Prediction / 候选动作容量预测

`predictVufForDeviceState()` gibt zusätzlich zurück / 额外返回：

- `capacityUsageRatio`
- `capacityLimitingMetric`

Die Werte werden aus demselben Building-Twin-P/Q-Modell berechnet; es wurde kein zweites Gebäudemodell eingeführt.

候选动作的 Capacity 由同一套 Building Twin P/Q 模型计算，没有引入第二套建筑模型。

### 4. PRE-LIMIT / CRITICAL / HARD Verhalten

**PRE-LIMIT 90–95 %**

- HP/WB bleiben downshift-only.
- Wenn ein einzelner Schritt Capacity unter Pre-Limit bringen kann, wird die kleinste ausreichende Intervention gewählt.
- Falls kein Einzelschritt ausreicht, wird der Kandidat mit der größten MODELED Capacity-Entlastung gewählt.

**CRITICAL 95–100 %**

- Gleicher One-Step-Pfad.
- Kandidaten, die in einem Schritt unter Pre-Limit kommen, werden bevorzugt.
- Sonst größte MODELED Capacity-Entlastung.

**HARD >=100 %**

- Alle legalen Lastreduktionsaktionen werden verglichen: Heatpump Downshift, Wallbox Downshift, Battery ON->OFF.
- Der größte sichere MODELED Capacity Relief gewinnt.
- Battery OFF->ON wird im Hard-Limit nicht zugelassen.

**中文：**

- 90–95%：优先选择“最小但足够”的降档动作；没有一步足够时，选择 MODELED Capacity 释放量最大的动作。
- 95–100%：优先把容量拉回 90% 以下，否则选择释放量最大的动作。
- >=100%：比较 HP 降档、WB 降档和 Battery ON→OFF，选择安全且 Capacity Relief 最大的动作。

### 5. Battery Capacity Guard / 电池容量保护

Battery OFF->ON bleibt im normalen VUF-Balancing bevorzugt, aber ein Kandidat wird verworfen, wenn seine vorhergesagte Building Capacity den konfigurierten Hard-Limit erreicht oder überschreitet.

Battery OFF→ON 在正常 VUF 调节中仍保持优先，但如果预测动作会使 Building Capacity 达到或超过 Hard Limit，则拒绝该候选动作。

### 6. Keine Rückfalllogik in VUF bei Capacity-Verletzung

Wenn Capacity >= Pre-Limit ist und kein legaler Capacity-reduzierender One-Step-Kandidat verfügbar ist, fällt die Logik nicht in einen VUF-Pfad zurück, der z. B. Battery OFF->ON erneut erhöhen könnte.

当 Capacity >= Pre-Limit 且没有合法的减载动作时，系统不会继续落入 VUF 优化路径，从而避免重新生成增加容量的 Battery OFF→ON 动作。

### 7. Frontend UI

**DE:**

- Chinesische Anzeige-Texte in `SimpleDashboard.vue` wurden entfernt.
- UI bleibt Englisch + Deutsch.
- Schrift im Grid-/Capacity-/Operator-/Advanced-Control-Bereich wurde moderat vergrößert.
- Accordion-Pfeile wurden auf 24 px vergrößert.
- Bestehende Farben, Kartenstruktur und Grid-Layout bleiben erhalten.
- Operator Adjustability bleibt separat einklappbar und behält Preview + Enter/Blur-Commit.

**中文：**

- `SimpleDashboard.vue` 中的中文前端显示文字已移除。
- 前端保留英语 + 德语。
- Grid / Capacity / Operator / Advanced Control 区域字体适当放大。
- 折叠箭头增大为 24 px。
- 保留现有颜色、Card 结构和 Grid 布局。
- Operator Adjustability 继续独立折叠，并保留 Preview + Enter/失焦后正式生效逻辑。

### 8. Nicht geändert / 未修改

- Branch-A ESP32 Firmware
- Branch-B / Shelly command contract
- MQTT topics
- VUF curve/history logic
- VUF Enter/Exit semantics
- Battery effective threshold 0.10 A
- Adjustability mapping
- Calibration service
- CUF/Schieflast bleiben nicht aktive Trigger
- HP/WB automatic upshift bleibt verboten

### 9. Regression-Invarianten

- Heatpump automatic: nur Downshift
- Wallbox automatic: nur Downshift
- Battery: OFF <-> ON
- One action per control cycle
- Adjustability floor bleibt hart
- Voltage Guard bleibt hart
- Pending/Confirmed/Settling bleibt erhalten
- Limits = 0: Capacity-Schutz bleibt deaktiviert

### 10. Tests

- 47 PASS / 0 FAIL
- AgentCard script syntax: PASS
- SimpleDashboard script syntax: PASS
- VufCard script syntax: PASS
- CapacitySupervisor.js syntax: PASS
- ControlPolicyConfig.js syntax: PASS
- Frontend template: keine chinesischen Anzeigezeichen

Ein vollständiger Vite-Production-Build wurde in dieser isolierten Umgebung nicht ausgeführt, da `client/node_modules` nicht vorhanden ist. Vor Pi5-Deployment bitte `npm ci` bzw. vorhandene Dependencies nutzen und `npm run build` ausführen.
