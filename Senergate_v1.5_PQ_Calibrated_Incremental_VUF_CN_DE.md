# Senergate REAL HARDWARE v1.5 — P/Q Calibration + Incremental VUF

> **v1.5.2 Hinweis / v1.5.2 提示:** Für den aktuellen `branchAB-vuf23`-Build wurde die MODELED Branch-A-Gebäudeäquivalenz von 40 A auf 60 A geändert. Die historischen 40/64/40-A-Angaben unten beschreiben den ursprünglichen v1.5-Stand. Maßgeblich für v1.5.2 ist `BRANCH_AB_SINGLE_MAX_VUF23_PATCH_CN_DE.md`. / 当前 `branchAB-vuf23` 版本已把 MODELED Branch-A 楼宇等效最大值从 40 A 调整为 60 A。下文 40/64/40 A 属于原 v1.5 历史基线；v1.5.2 以 `BRANCH_AB_SINGLE_MAX_VUF23_PATCH_CN_DE.md` 为准。

# Senergate REAL HARDWARE v1.5——P/Q 校准 + 增量式 VUF 模型

**Frontend build:** `v1.5-pq-calibrated-incremental-vuf`  
**Basis / 基线:** v1.4 Twin 40/64/40 A  
**Date / 日期:** 2026-09-12

---

## 1. Ziel / 目标

**DE:** VUF bleibt der zentrale Regel- und Demonstrationsindikator. Die bisherige Kombination aus fest modelliertem Strom und live gemessenem Gesamt-PF wird jedoch ersetzt. Das neue Modell identifiziert P/Q-Geräteprofile aus der realen Prototype-Hardware, skaliert P und Q gemeinsam auf Gebäudeebene und berechnet daraus komplexe Ströme sowie einen **Estimated VUF**.

**中文：** VUF 继续作为主要控制和展示指标，但不再把“固定模拟电流”与“小功率 Prototype 的实时总 PF”直接混用。新版从真实硬件测量中识别各设备 P/Q Profile，把 P 和 Q 一起缩放到楼宇尺度，再计算复数电流和 **Estimated VUF**。

---

## 2. Drei Wahrheitsebenen / 三层真值

| Layer / 层 | Source / 来源 | Meaning / 含义 |
|---|---|---|
| MEASURED | Shelly Pro 3EM + optional Pico | PCC U/I/P/S/PF + current waveform features |
| EXECUTION | ESP32 Branch A, Shelly relay status, Battery switch status | Geräteausführung / 设备执行状态 |
| MODELED / ESTIMATED | Pi5 Digital Twin | Building P/Q/I, projected voltage phasors, Estimated VUF |

Measured und modeled values werden nicht als dieselbe physikalische Größe ausgegeben. / 实测值与模型值不再混为同一种物理量。

---

## 3. Bestätigte Gerätegrößen / 已确认的楼宇等效容量

| Phase | Asset | Building target |
|---|---|---:|
| L1 | 2 equivalent Heat-Pump modules | max. 40 A |
| L2 | 4 equivalent Wallboxes | max. 64 A |
| L3 | Building Battery | max. 40 A |

Diese Werte sind **Kapazitätsziele**, nicht mehr direkt hart codierte Stromwerte jedes Zustands. / 这些值是**楼宇容量上限目标**，不再代表每个状态直接硬编码的电流。

---

## 4. Automatische reale P/Q-Kalibrierung / 自动真实 P/Q 校准

Neue Backend-Komponente: `server/ElectricalCalibrationService.js`.

Die Kalibrierung wird nur nach expliziter Bedienerbestätigung gestartet: `CALIBRATE_REAL_HARDWARE`. / 校准必须由操作员明确确认后启动。

### Ablauf / 流程

1. AI CONTROL muss OFF sein. / AI 必须关闭。
2. Preflight: Shelly, Branch A, Branch-B relay status und Battery status müssen frisch sein. / 检查所有测量与执行状态是否新鲜。
3. Alle steuerbaren Geräte OFF. / 所有可控设备关闭。
4. 10 s all-OFF PCC baseline capture. / 采集 10 秒全部关闭的 PCC 基线。
5. Heat Pump: 10 / 20 / 30 / 40 / 50 Hz; je Zustand 8 s Mindest-Stabilisierung, zusätzliche RFRD/actual-Hz-Bestätigung, danach 10 s Messfenster. / 每档先稳定并确认实际频率，再采样 10 秒。
6. Wallbox: relay masks 1 / 2 / 3; Statusbestätigung + 10 s Messfenster. / 三个 Relay 组合分别实测。
7. Battery: OFF/ON; Statusbestätigung + 10 s Messfenster. / 电池 OFF/ON 实测。
8. Profile speichern; anschließend alle Geräte sicher OFF. / 保存 Profile，结束后全部设备关闭。

Runtime-Datei / 运行时文件:

```text
server/config/electrical_profiles.json
```

Diese Datei ist lokal in `.gitignore`; ein neutrales Beispiel liegt als `electrical_profiles.example.json` bei. / 真实校准文件默认不提交 Git，仓库仅提供示例文件。

---

## 5. Q-Bestimmung / 无功功率 Q 的估算

### Priorität 1: Pico + Shelly

Wenn Pico einen brauchbaren Fundamentalanteil liefert:

\[
r_1=I_{1,rms}/I_{rms}
\]

\[
I_{1,abs}=I_{Shelly}\cdot r_1
\]

\[
S_1=U\cdot I_{1,abs}
\]

\[
Q_1=\pm\sqrt{S_1^2-P^2}
\]

Damit wird Verzerrungs-PF nicht vollständig als Phasenverschiebung interpretiert. / 这样可减少把谐波畸变 PF 误当成相位偏移的错误。

### Priorität 2: Shelly apparent power

Falls Pico nicht verfügbar ist:

\[
Q=\pm\sqrt{S^2-P^2}
\]

mit Shelly `P` und `S`.

### Sign policy / Q 符号策略

- Heat Pump / VFD: lagging
- Wallbox resistive prototype: near-unity
- Battery charger: near-unity

Das Vorzeichen bleibt eine Modellannahme, solange keine synchrone Spannungs-/Stromphasormessung vorliegt. / 在没有同步电压-电流相量测量前，Q 的正负仍属于模型假设。

---

## 6. Building-Scale P/Q statt Strommultiplikator / 用 P/Q 缩放代替电流倍率

Für jedes Asset wird aus den real gemessenen Delta-Werten gegenüber dem all-OFF Baselinezustand bestimmt:

\[
\Delta P=P_{state}-P_{baseline}
\]

\[
\Delta Q=Q_{state}-Q_{baseline}
\]

Die komplexe Leistung wird **gemeinsam** auf die bestätigte Gebäude-Kapazität skaliert:

\[
S_{building}=K(P+jQ)
\]

Dadurch bleibt das elektrische Verhältnis von P/Q erhalten. / P、Q 同比例放大，因此不会像以前按相任意乘不同电流倍率那样人为改变相间关系。

Dann:

\[
\boxed{I=\left(\frac{S}{V}\right)^*}
\]

---

## 7. Incremental PCC model / 增量式 PCC 模型

Die all-OFF Shelly-Spannung wird als reale PCC-Basis verwendet. Nur die **zusätzliche Building-Twin-Last** wird durch die modellierte Feeder-Impedanz propagiert.

全部可控设备关闭时的 Shelly 电压作为真实 PCC 基线；模型只计算新增楼宇等效负载产生的额外压降。

\[
\Delta I_N=\Delta I_A+\Delta I_B+\Delta I_C
\]

\[
\boxed{
V_{A,proj}=V_{A,PCC,OFF}-Z_{phase}\Delta I_A-Z_N\Delta I_N
}
\]

B/C analog / B、C 相同。

Dies vermeidet den bisherigen Fehler, einen zusätzlichen `ZI`-Abfall von einer bereits am PCC gemessenen belasteten Spannung abzuziehen. / 避免对已经包含真实线路压降的 PCC 电压再次减去完整 ZI。

---

## 8. VUF / 电压不平衡度

Die VUF-Formel bleibt unverändert:

\[
a=e^{j120^\circ}
\]

\[
V_1=(V_A+aV_B+a^2V_C)/3
\]

\[
V_2=(V_A+a^2V_B+aV_C)/3
\]

\[
\boxed{VUF=|V_2|/|V_1|\times100\%}
\]

Baseline phase angles bleiben mangels synchroner Dreiphasen-Spannungsmessung angenommen:

```text
L1 = 0°
L2 = -120°
L3 = +120°
```

Die Phasor-Karte zeigt nun jedoch die **berechneten Winkel der projizierten komplexen Lastspannungen**, also dieselben Phasoren, die auch in VUF eingehen. / Phasor 图现在显示真正参与 VUF 运算的投影复数电压角度。

---

## 9. Weak-Grid Demo > 2.5 % VUF

Der explizit als Demo markierte Preset verwendet:

```text
Rphase = 0.260 Ω
Xphase = 0.091 Ω
RN     = 0.030 Ω
XN     = 0.010 Ω
```

Kein direkter VUF-Multiplikator wird verwendet. / 不直接给 VUF 乘倍率。

Mit dem Fallback-P/Q-Profil und einem schweren einphasigen Wallbox-Szenario:

```text
L1 = 0 A
L2 = 64 A
L3 = 0 A
```

ergibt der Regressionstest:

```text
Estimated VUF ≈ 2.620 %
Projected voltages ≈ 230.6 / 210.9 / 231.4 V
Voltage guard = SAFE
```

Alle drei Assets auf Maximum 40/64/40 A ergeben im gleichen Modell etwa 0.778 % VUF. / 三类设备最大开启后模型 VUF 约 0.778%，体现补偿后的改善。

**Wichtig:** Der Weak-Grid Demo ist weiterhin `MODELED / NOT SITE CALIBRATED`. / 该场景仍属于模型演示，不是现场实测阻抗。

---

## 10. AI-Regelung / AI 控制

Auf Wunsch bleibt **Estimated VUF der primäre KPI**.

AI candidate search:

1. erzeugt zulässige one-step Geräteänderungen;
2. berechnet für jeden Kandidaten P/Q → I → projected voltage → VUF;
3. verwirft Kandidaten hart, wenn irgendeine Phase außerhalb 207–253 V liegt;
4. sortiert die verbleibenden Kandidaten ausschließlich nach VUF;
5. führt nur einen Kandidaten aus, der VUF verbessert.

Das Spannungsfenster ist also eine harte Constraint, kein zweiter Optimierungs-KPI. / 电压范围是硬约束，不是第二个优化目标；VUF 仍然是主要优化指标。

---

## 11. VUF Anzeige / VUF 显示一致性

VUF Card und Grid Condition verwenden dieselbe Rundung auf eine Nachkommastelle **auch für die Zustandsklassifikation**.

VUF Card 和 Grid Condition 使用相同的一位小数值进行显示和状态判断。

```text
< 1.0%       BALANCED
1.0–2.0%     WARNING
> 2.0%       CRITICAL
```

Beispiel: raw 2.01% → Anzeige 2.0% → WARNING; raw 2.06% → Anzeige 2.1% → CRITICAL. / 避免再次出现 `2.0% CRITICAL` 的视觉矛盾。

---

## 12. Wichtige Dateien / 关键文件

```text
client/src/ElectricalProfileModel.js
client/src/components/PhasorCalculator.js
client/src/components/SimpleDashboard.vue
client/src/components/AgentCard.vue
client/src/components/VufCard.vue
client/src/components/PhasorCard.vue
client/src/VufPresentation.js

server/ElectricalCalibrationService.js
server/EnergyMeterService.js
server/PicoService.js
server/EspService.js
server/WallboxService.js
server/BatteryService.js
server/config/electrical_profiles.example.json
```

Branch-A P03/STOP/ZERO_HOLD/refresh semantics bleiben unverändert. / Branch A 原有 P03、STOP、ZERO_HOLD、refresh guard 不变。

---

## 13. Tests / 测试

27 vorhandene und neue Node-/Static-Regressionstests: **27/27 PASS**.

Neue Schwerpunkte:

```text
pq_profile_model_test.mjs
incremental_pcc_model_static_test.mjs
electrical_calibration_service_static_test.mjs
agent_voltage_guard_static_test.mjs
real_hardware_vuf_demo_test.mjs
```

Der vollständige Vite-Build konnte in der Erstellungsumgebung nicht ausgeführt werden, weil der npm-Registry-Zugriff temporär mit `EAI_AGAIN` fehlgeschlagen ist. Es wurden jedoch alle geänderten JS/Vue-Scriptblöcke syntaktisch geprüft und alle 27 Regressionstests bestanden. / 生成环境无法访问 npm Registry，因此无法完成 Vite bundle；但所有修改过的 JS/Vue script 均通过语法检查，27 个回归测试全部通过。

---

## 14. Pi5 Deployment / Pi5 部署

Da keine neuen npm-Abhängigkeiten hinzugefügt wurden, bleiben `package.json` und die vorhandene Dependency-Struktur unverändert.

```bash
cd ~/projects/pi-full-stack/client
npm ci
npm run dev -- --host 0.0.0.0
```

Backend:

```bash
cd ~/projects/pi-full-stack/server
node index.js
```

Nach dem Update im Browser `Ctrl+Shift+R` und Build-Version prüfen:

```text
v1.5-pq-calibrated-incremental-vuf
```

Vor der ersten P/Q-Kalibrierung AI CONTROL ausschalten, anschließend den Button `CALIBRATE P/Q · REAL HARDWARE` verwenden. / 第一次 P/Q 校准前必须关闭 AI CONTROL，然后通过页面校准按钮启动真实硬件测量序列。

---

## 15. Engineering-Grenze / 工程边界

Auch mit dieser Verbesserung bleibt der angezeigte VUF **ESTIMATED / MODELED**, weil die aktuelle Hardware keine synchronen dreiphasigen Spannungswinkel misst. Das Modell ist physikalisch konsistenter und aus realen P/Q-Profilen abgeleitet, aber keine IEC-61000-4-30-VUF-Messung. / 即使采用新版算法，当前 VUF 仍是 ESTIMATED/MODELED，因为现有硬件没有同步测量三相电压相角；它比旧版更接近真实物理，但不能称为 IEC 61000-4-30 合规实测 VUF。
