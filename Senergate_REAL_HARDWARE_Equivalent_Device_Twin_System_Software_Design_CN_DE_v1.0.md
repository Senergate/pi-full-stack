# Senergate REAL HARDWARE – Equivalent Device Twin System & Software Design
# Senergate REAL HARDWARE——等效设备数字孪生系统与软件设计策略

**Version / 版本:** 1.0  
**Date / 日期:** 2026-09-10  
**Scope / 范围:** Pi5 Node.js backend, Vue Frontend, Shelly Pro 3EM, Branch A ESP32/ATV12, Branch B Shelly relays, Building Twin, Estimated VUF, AI control

---

## 1. Zielbild / 总体目标

**DE:** Das System läuft ausschließlich im REAL-HARDWARE-Modus. Die kleine physische Prototype-Hardware bleibt die Ausführungs- und Messebene. Eine getrennte Building-Twin-Schicht bildet reale Gerätezustände auf äquivalente Gebäudelasten ab. Der VUF-Demowert wird nicht durch willkürliche phasenabhängige Stromverstärkungen erzeugt, sondern durch ein transparentes äquivalentes Gerätemodell plus ein explizit als MODELED gekennzeichnetes Feeder-Impedanzmodell.

**中文：** 系统只保留 REAL HARDWARE 模式。小功率 Prototype 负责真实测量与真实执行；单独的 Building Twin 层把真实设备状态映射为建筑尺度的等效负载。VUF 演示不再依赖任意的三相 `800/400/230` 电流倍数，而是由“等效设备模型 + 明确标记为 MODELED 的馈线阻抗模型”产生。

### Kernprinzipien / 核心原则

1. **MEASURED ≠ EXECUTION ≠ MODELED.**  
   **实测、执行反馈、模型估算必须分开。**
2. **OFF = 0 A** für den kontrollierten Building-Twin-Strom.  
   **所有可控设备关闭时，投影可控电流必须为 0 A。**
3. Keine per-phase Gains `800/400/230`.  
   **删除无物理依据的 800/400/230 分相倍率。**
4. Ein gemeinsames Modell für Anzeige, VUF und AI-Prädiktion.  
   **UI、VUF、AI 预测使用同一个设备模型。**
5. Branch B ist Shelly-basiert, nicht ESP32-basiert.  
   **Branch B 在线/执行状态来自 Shelly Relay 0/1。**
6. Ein langsamer/offline Branch B darf andere Geräte nicht global sperren.  
   **Branch B 状态慢或离线不能锁死 Heatpump/Battery/其他控制。**
7. Pending-Kommandos brauchen Timeout, aber Timeout bedeutet niemals „ausgeführt“.  
   **Pending 必须超时释放，但超时不等于执行成功。**

---

## 2. Systemgrenzen und Wahrheitsquellen / 系统边界与真值来源

### 2.1 Messwahrheit / 测量真值

**DE:** Shelly Pro 3EM liefert reale PCC-Werte wie Spannung, Strom, Leistung, PF und Frequenz. Diese Werte bleiben unverstärkt und werden nicht als Building-Twin-Ströme umdeklariert.

**中文：** Shelly Pro 3EM 提供 PCC 真实电压、电流、功率、PF 和频率。这些数据不再乘放大倍数，也不会被伪装成建筑级电流。

### 2.2 Ausführungswahrheit / 执行真值

- **Branch A:** ESP32-A → RS485/Modbus → ATV12 + Motor.
- **Branch B:** Pi5/WallboxService → Shelly Relay 0/1 → Widerstände.
- **Battery:** BatteryService / aktueller Backend-Pfad.

**中文：** Branch A 的真实执行状态来自 ESP32-A；Branch B 的真实执行状态来自 Shelly 两个 Relay 的实际状态，而不是不存在的 ESP32-B。

### 2.3 Modellwahrheit / 模型真值

**DE:** Pi5/Vue erzeugt aus bestätigten Gerätezuständen einen Building-Twin-Strom und berechnet daraus mit modellierter Netzimpedanz einen Estimated VUF.

**中文：** Pi5/Vue 根据已确认的设备状态生成建筑级等效电流，再通过建模的电网阻抗计算 Estimated VUF。

---

## 3. Zielarchitektur / 目标架构

```text
Shelly Pro 3EM -----------------------------> MEASURED U/I/P/PF/f
      |                                              |
      |                                              +--> Vue MEASURED
      |
ESP32-A status ---> Branch A state -----------------+
Shelly Relay R0/R1 -> Branch B state ---------------+--> Equivalent Device Model
Battery status -------------------------------------+         |
                                                             v
                                                  Building-Twin Current
                                                  I_A / I_B / I_C
                                                             |
                                                             v
                                                   Demo Feeder R/X Model
                                                             |
                                                             v
                                                     Estimated VUF
                                                             |
                                              +--------------+--------------+
                                              |                             |
                                              v                             v
                                         Vue Display                  AI Predictor
                                                                            |
                                                                            v
                                                               Delta device command
                                                                            |
                                                                            v
                                                         real execution + confirmation
```

**DE:** Entscheidend ist, dass die gemessenen Shelly-Ströme nicht in die äquivalenten Building-Twin-Ströme hineinskaliert werden. Sie dienen als Mess- und Freshness-Ebene; die Building-Twin-Ströme entstehen aus Gerätezuständen.

**中文：** 关键点是 Shelly 实测电流不再直接放大为 Building-Twin 电流。Shelly 数据负责测量和 Freshness；Building-Twin 电流只由设备状态和设备模型产生。

---

## 4. Äquivalentes Gerätemodell / 等效设备模型

Zentrale Datei / 核心文件:

```text
client/src/BuildingTwinModel.js
```

### 4.1 Branch A – Heat Pump

Physischer Prototype / 物理原型：

```text
1 × ATV12 + Motor
      ↓
3 × equivalent Heat Pumps
```

Modell / 模型：

```text
Level 0 ->  0 A
Level 1 ->  7 A
Level 2 -> 14 A
Level 3 -> 21 A
Level 4 -> 28 A
Level 5 -> 35 A
```

**DE:** `35 A` ist die modellierte maximale Gesamtstromwirkung der drei äquivalenten Wärmepumpen, nicht der gemessene Motorstrom. Die lineare Level-Abbildung ist eine Demo-Annahme und soll später durch eine validierte Kennlinie ersetzt werden.

**中文：** `35 A` 表示三台等效 Heat Pump 的建筑级聚合最大电流，不是电机真实测得的电流。Level 线性关系只是 Demo 模型，未来应使用真实设备铭牌或测量曲线替换。

### 4.2 Branch B – Wallbox

Physischer Prototype / 物理原型：

```text
Relay 0 + resistor -> 2 equivalent Wallboxes
Relay 1 + resistor -> 2 equivalent Wallboxes
Both ON            -> 4 equivalent Wallboxes
```

Modell / 模型：

```text
1 equivalent Wallbox = 16 A
Relay 0 ON          = 32 A
Relay 1 ON          = 32 A
Both ON             = 64 A
```

**DE:** `0..3` bleibt eine 2-Bit-Relay-Maske und darf nicht als linearer Lastlevel interpretiert werden.

**中文：** Branch B 的 `0..3` 始终是两个 Relay 的 bitmask，不能当成线性负载档位。

### 4.3 Battery

```text
OFF / idle -> 0 A
Charging   -> 20 A
```

Auch dieser Wert ist eine Modellannahme. / 该数值同样属于模型假设。

### 4.4 OFF-Invariante / OFF 不变量

```text
Heatpump OFF + Wallbox R0/R1 OFF + Battery OFF
=> Projected controlled current = 0 / 0 / 0 A
```

Damit tritt der frühere Fehler `240/100/100 A trotz OFF` nicht mehr auf.  
因此不会再出现上一版“设备全关但仍显示 240/100/100 A”的错误。

---

## 5. Warum keine 800/400/230-Gains mehr? / 为什么彻底删除 800/400/230

**DE:** Die Faktoren hatten keine dokumentierte physikalische Herleitung. Unterschiedliche Faktoren je Phase verändern das Verhältnis der gemessenen Ströme künstlich. Deshalb wurden sie vollständig aus dem Building-Twin-Modell entfernt.

**中文：** 800/400/230 没有可证明的物理来源，而且不同相使用不同倍率会人为改变三相比例，因此从 Building Twin 中完全删除。

Alt / 旧逻辑：

```text
I_projected,L1 = I_Shelly,L1 × 800
I_projected,L2 = I_Shelly,L2 × 400
I_projected,L3 = I_Shelly,L3 × 230
```

Neu / 新逻辑：

```text
I_projected,L1 = HeatpumpEquivalentCurrent(level)
I_projected,L2 = WallboxEquivalentCurrent(relayMask)
I_projected,L3 = BatteryEquivalentCurrent(state)
```

---

## 6. Demo Feeder – VUF > 2 % ohne Strom-Fake / 不伪造电流实现 VUF > 2%

Da kleine Prototype-Ströme in einem steifen Niederspannungsnetz kaum VUF > 2 % erzeugen, wird für die Demo ein explizites Building-Twin-Feeder-Modell verwendet.

由于 Prototype 功率很小，在低阻抗低压电网中真实 VUF 很难超过 2%，因此 Demo 使用明确标记的 Building-Twin Feeder 模型。

### Default Demo Feeder

```text
R_phase   = 0.40 Ω
X_phase   = 0.15 Ω
R_neutral = 0.30 Ω
X_neutral = 0.10 Ω
```

Kennzeichnung / 标记：

```text
MODELED DEMO FEEDER
NOT SITE CALIBRATED
```

**Wichtig / 重要：** Diese Werte sind bewusst keine behaupteten Messwerte des aktuellen Standorts. Sie zeigen eine modellierte längere/schwächere Zuleitung. Für eine spätere technische Validierung müssen sie aus Kabeltyp, Länge, Querschnitt, Neutralleiter und/oder Netzimpedanzmessung abgeleitet werden.

这些值不是当前现场的实测阻抗，而是用于演示的“较长/较弱馈线”模型。正式工程验证时必须由电缆类型、长度、截面积、中性线以及/或者现场电网阻抗测量推导。

### Reproduzierbarer Demo-Punkt / 可复现 Demo 点

Bei idealen 230-V-Quellwinkeln und den aktuellen PF-Testwerten:

```text
Alle Geräte OFF                 0 / 0 / 0 A
Branch A Level 5               35 / 0 / 0 A   -> VUF ≈ 2.215 %
Branch A + Branch B R0 + Bat.  35 / 32 / 20 A -> VUF ≈ 0.742 %
```

Damit stammt die sichtbare >2%-Reaktion aus einem transparenten Netzmodell und nicht aus einer willkürlichen Messwertverstärkung.

这样 >2% 的 VUF 来自透明的电网模型，而不是任意放大测量电流。

---

## 7. VUF-Berechnung / VUF 计算策略

```text
VUF = |V2| / |V1| × 100 %
```

**DE:** Solange keine synchron gemessenen dreiphasigen Spannungswinkel vorliegen und die Netzimpedanz modelliert ist, heißt der Wert konsequent **Estimated VUF / Model-estimated VUF**.

**中文：** 在没有同步测得三相电压相角、且电网阻抗仍为模型参数的情况下，该值必须始终标记为 **Estimated VUF / 模型估算VUF**。

Anzeige, VUF-Rechnung und AI-Prädiktion verwenden dieselbe Funktion:

```text
projectBuildingCurrents(deviceState)
```

Dadurch wird verhindert, dass UI und AI unterschiedliche Strommodelle benutzen.  
这样可避免 UI、VUF 和 AI 使用不同电流模型。

---

## 8. Startup-Strategie / 系统启动策略

### 8.1 Core Startup Gate / 核心启动门控

Globale Betriebsfreigabe:

```text
Socket connected
AND Services ready
AND MQTT connected
AND fresh Shelly measurement
AND fresh valid Branch-A status
```

Branch B und Battery werden geprüft und angezeigt, blockieren aber nicht das gesamte Dashboard.

Branch B 和 Battery 会进行状态检查和显示，但不会阻塞整个 Dashboard。

### 8.2 Initialzustand / 初始化状态

```text
unknown = null
```

**DE:** Beim Browserstart werden Geräte nicht künstlich auf OFF gesetzt. Erst frische Hardware-/Service-Rückmeldung erzeugt einen bekannten Zustand.

**中文：** 浏览器启动时不会人为把设备写成 OFF；只有收到新的硬件/服务反馈后才确认真实状态。

### 8.3 Browserstart sendet keinen automatischen STOP

**DE:** Ein Refresh der HMI darf kein physischer Not-/Stoppbefehl sein. Existierende aktive Geräte werden angezeigt, nicht automatisch abgeschaltet.

**中文：** 浏览器刷新不是硬件 STOP 事件。如果设备已经运行，页面只读取并显示真实状态，不会自动停机。

---

## 9. Control-Readiness und Regression-Schutz / 控制就绪与回归保护

Globale Bedienfreigabe bleibt bewusst klein:

```js
controlReady = measurementFresh && branchAReady
```

**DE:** Branch B ist kein globales Freigabekriterium. Dadurch blockiert ein verzögerter Shelly-Relay-Status nicht Heatpump, Battery oder andere Bedienaktionen.

**中文：** Branch B 不参与全局 `controlReady`。因此 Shelly Relay 状态慢，不会再次造成“开一个电阻后其他设备十几秒不能控制”的问题。

---

## 10. Branch-B-Steuerung / Branch B 控制策略

Online/Ready:

```text
Relay 0 known + fresh
AND
Relay 1 known + fresh
```

Ein Befehl verändert den bestätigten UI-Zustand nicht sofort auf `null`.

命令发出后不会把已确认状态立即改成 `null`。

```text
confirmed OFF
command ON
     ↓
pending target = ON
confirmed state remains OFF
     ↓
Shelly status ON arrives
     ↓
confirmed ON
pending cleared
```

Damit bleiben andere Bedienelemente unabhängig nutzbar.  
这样其他控制不会被一个 Relay 的反馈延迟锁死。

---

## 11. Pending-Command-Strategie / Pending 命令策略

Neuer Schutz:

```text
COMMAND_PENDING_TIMEOUT = 3000 ms
```

Ablauf:

```text
COMMAND SENT
   |
   +--> matching execution feedback <= 3 s -> CONFIRMED
   |
   +--> no confirmation after 3 s          -> TIMEOUT
                                                |
                                                +-> pending released
                                                +-> NOT treated as success
```

**DE:** Das verhindert einen permanenten AI-/UI-Lock bei verlorener Rückmeldung. Timeout ist nur ein Kommunikations-/Bestätigungsfehler und niemals ein Nachweis der Ausführung.

**中文：** 这样避免反馈丢失导致 Pending 永久锁住 AI/UI。Timeout 仅表示没有确认，绝不能当成执行成功。

---

## 12. Branch-A-Sicherheitsvertrag / Branch A 安全合同

Die Frontend-/Pi5-Änderungen verändern die Embedded-Invarianten nicht:

- `STOP` überschreibt `target_hz` auf 0.
- `ZERO_HOLD != STOP`.
- Nach STOP benötigt `start,x>2Hz` die vollständige Drivecom-Startsequenz.
- Periodischer RUN-Refresh benötigt lokalen erlaubten Zustand + Run-Marker.
- MQTT/Netzwerk darf den Modbus-Single-Owner nicht umgehen.

中文：前端和 Pi5 的修改不会改变 Branch A 已验证的不变量：STOP 覆盖频率、ZERO_HOLD 不等于 STOP、STOP 后重新启动走完整 Drivecom sequence、RUN refresh 有本地状态门禁、Modbus 仍保持 single owner。

---

## 13. AI-Regelstrategie / AI 控制策略

### Aktueller Entscheidungsraum / 当前候选空间

- Heatpump: ein Level hoch/runter innerhalb erlaubter Grenzen.
- Wallbox: einzelne Relay-Bits setzen/löschen; kein linearer 0→1→2→3-Level-Fehler.
- Battery: charging ON/OFF.

### Gemeinsame Prädiktion / 共用预测

Für jeden Kandidaten:

```text
candidate device state
      ↓
projectBuildingCurrents()
      ↓
PhasorCalculator.analyzeVUF()
      ↓
predicted Estimated VUF
```

Alle erlaubten One-Step-Kandidaten werden miteinander verglichen; nicht mehr zuerst nur „Reduktion“ und danach eventuell „Kompensation“.

所有允许的一步候选统一比较，不再采用旧的 reduction-first 贪心逻辑。

---

## 14. Datenmodell / 数据模型

### MEASURED

```text
energy_meter.measured.a_current
energy_meter.measured.b_current
energy_meter.measured.c_current
energy_meter.measured.a/b/c_voltage
energy_meter.measured.a/b/c_pf
```

### EXECUTION

```text
heatpump.level / Branch-A status
wallbox.r0 / wallbox.r1
battery.charging
```

### MODELED

```text
projectedCurrents.a/b/c
grid.rPhase / xPhase / rNeutral / xNeutral
Estimated VUF
predicted VUF
```

Diese drei Ebenen dürfen nicht wieder vermischt werden.  
这三层数据以后不能再混用。

---

## 15. Geänderte Dateien / 修改文件

```text
client/src/BuildingTwinModel.js
client/src/components/SimpleDashboard.vue
client/src/components/AgentCard.vue

tests/building_twin_model_test.mjs
tests/real_hardware_vuf_demo_test.mjs
tests/equivalent_device_no_gain_static_test.mjs
tests/pending_timeout_static_test.mjs
tests/control_regression_restore_static_test.mjs
```

Bestehende Branch-B-Shelly-, Startup- und REAL-only-Fixes bleiben erhalten.

原有 Branch-B Shelly、Startup 和 REAL-only 修复均保留。

---

## 16. Regressionstests / 回归测试

Die aktuelle Version besteht alle vorhandenen und neuen Node-/Static-Tests.

当前版本通过全部现有和新增 Node/Static 测试，包括：

```text
agent_candidate_strategy_static_test.mjs          PASS
agent_manual_patch_static_test.mjs                PASS
branchb_shelly_readiness_static_test.mjs          PASS
bugfix3_smoke_test.mjs                            PASS
building_twin_model_test.mjs                      PASS
control_regression_restore_static_test.mjs        PASS
equivalent_device_no_gain_static_test.mjs         PASS
heatpump_command_contract_test.mjs                PASS
pending_timeout_static_test.mjs                   PASS
pi5_heartbeat_static_test.mjs                     PASS
real_hardware_vuf_demo_test.mjs                   PASS
real_only_frontend_static_test.mjs                PASS
startup_display_null_gate_static_test.mjs         PASS
startup_initialization_static_test.mjs            PASS
static_heatpump_no_legacy_path_test.mjs           PASS
vue_import_usage_static_test.mjs                   PASS
```

Zusätzliche Syntaxprüfung / 额外语法检查：

```text
BuildingTwinModel.js    PASS
SimpleDashboard.vue JS  PASS
AgentCard.vue JS        PASS
```

---

## 17. Pi5-Verifikation / Pi5 验证步骤

Nach dem Entpacken bzw. Git-Update:

```bash
cd ~/projects/pi-full-stack/client
npm ci
npm run build
```

Backend starten:

```bash
cd ~/projects/pi-full-stack/server
node index.js
```

Frontend starten:

```bash
cd ~/projects/pi-full-stack/client
npm run dev -- --host 0.0.0.0
```

### Funktionsprüfung / 功能检查

1. Alle Geräte OFF → Building-Twin Current `0 / 0 / 0 A`.
2. Branch A Level 5 → L1 `35 A` modeled.
3. Branch-B Relay 0 ON → L2 `32 A` modeled.
4. Branch-B Relay 1 ON zusätzlich → L2 `64 A` modeled.
5. Ein Relay-Befehl darf Heatpump/Battery-Bedienung nicht blockieren.
6. Pending ohne Feedback wird nach 3 s freigegeben und als Timeout geloggt.
7. Demo Feeder + Branch A Level 5 → Estimated VUF > 2 %.
8. VUF muss überall als ESTIMATED/MODELED gekennzeichnet bleiben.

中文验证：

1. 全部设备 OFF → Building-Twin 电流 `0 / 0 / 0 A`。
2. Branch A Level 5 → L1 模型电流 `35 A`。
3. Branch-B Relay 0 ON → L2 `32 A`。
4. 两个 Relay ON → L2 `64 A`。
5. 操作一个 Relay 后不能锁死 Heatpump/Battery。
6. Pending 3 秒无反馈必须释放并记录 Timeout，不能认为成功。
7. Demo Feeder + Branch A Level 5 → Estimated VUF > 2%。
8. VUF 始终保持 ESTIMATED/MODELED 标记。

---

## 18. Risiken und nächste Validierung / 风险与下一步验证

### Noch modelliert / 仍为模型假设

- Heatpump aggregate max current `35 A`.
- Wallbox current `16 A/device`.
- Battery current `20 A`.
- Demo Feeder `0.40+j0.15 Ω`, Neutral `0.30+j0.10 Ω`.
- Phasenwinkel, solange keine synchrone dreiphasige Winkelmessung vorliegt.

### Empfohlene nächste Schritte / 推荐后续

1. Wärmepumpen-Kennlinie aus realen Daten/nameplate ableiten.
2. Wallbox-Modell auf tatsächliche 1-/3-phasige Ladeprofile abstimmen.
3. Feeder-Impedanz aus Kabelparametern oder Messung ableiten.
4. Command-ID/Generation bis ACK/Status korrelieren.
5. Source timestamp / boot-id für retained/stale MQTT absichern.
6. Schieflast/CUF als primären lokalen Regelindikator zusätzlich zum Estimated VUF führen.

---

## 19. Designentscheidung in einem Satz / 一句话设计结论

**DE:** Reale Hardwarezustände treiben ein transparentes äquivalentes Gerätemodell; ein klar gekennzeichnetes Demo-Feeder-Modell erzeugt die sichtbare VUF-Dynamik, während Messwerte, Ausführungszustände und Modellwerte strikt getrennt bleiben und kein einzelner optionaler Aktor die gesamte Bedienung blockieren darf.

**中文：** 真实硬件状态驱动透明的等效设备模型，明确标记的 Demo Feeder 模型负责产生可展示的 VUF 动态；实测、执行状态和模型值严格分离，并且任何单个可选执行器都不能锁死整个控制系统。
