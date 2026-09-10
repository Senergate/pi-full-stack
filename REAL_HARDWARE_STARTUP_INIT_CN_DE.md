# Senergate pi-full-stack – REAL HARDWARE only + Startup Initialization
# Senergate pi-full-stack——仅 REAL HARDWARE + 首次启动初始化检查

**Stand / 日期:** 2026-09-10

## 1. Ziel / 目标

**DE:** Die Browser-Simulation und der Runtime-Umschalter wurden entfernt. Das Frontend arbeitet nur noch mit dem realen Pi5/Socket.IO/MQTT-Pfad. Beim ersten Öffnen des Dashboards werden keine Aktorzustände angenommen und keine automatischen STOP-Befehle gesendet. Stattdessen wird zuerst der reale Initialzustand abgefragt und die Bedienung bis zum Abschluss gesperrt.

**中文：** 已移除浏览器 Simulation 与模式切换。前端只保留真实 Pi5 / Socket.IO / MQTT 路径。首次打开 Dashboard 时，不再假定设备为 OFF，也不会自动发送 STOP；系统先读取真实初始化状态，在检查完成前禁止手动与 AI 执行。

## 2. Warum beim Browser-Start kein automatisches STOP? / 为什么首次打开网页不自动 STOP？

**DE:** Ein Browser-Refresh oder ein zweiter Bedien-PC darf nicht unerwartet reale Hardware stoppen. Deshalb ist der Startup-Pfad read-first und fail-closed: unbekannte Zustände bleiben `null`, Bedienung bleibt gesperrt, aktive Geräte werden sichtbar gewarnt.

**中文：** 浏览器刷新或第二台电脑打开页面不应该意外停止真实设备。因此启动采用“先读取、失败关闭”的策略：未知状态保持 `null`，控制被锁定；如果发现设备已经运行，界面明确告警，但不自动改变硬件状态。

## 3. Startup-Sequenz / 初始化流程

```text
Browser / Vue
    |
    v
Socket.IO -> Pi5 :4000
    |
    v
getServices()
    |
    v
MqttService.status()
    |
    +--> MQTT connected?
    +--> Pi5 heartbeat active?
    |
    v
Bind REAL listeners
    |
    +--> EnergyMeterService  -> Shelly PCC
    +--> EspService          -> Branch A status / ACK
    +--> EspService          -> Branch B status / ACK
    +--> WallboxService      -> relay 0 / relay 1
    +--> BatteryService      -> charging state
    |
    v
requestUpdate()
    |
    v
Wait max. 6 s for fresh state after request
    |
    +--> all required states known -> READY
    |
    +--> SAFE_MODE / FAULT / ERROR -> FAULT, controls blocked
    |
    +--> missing data -> TIMEOUT, controls blocked
```

## 4. Initialzustände / 初始状态

Die folgenden Vue-Zustände starten bewusst als UNKNOWN:

```js
heatpump.level = null
wallbox.r0 = null
wallbox.r1 = null
battery.charging = null
energy_meter.lastUpdate = null
```

Nicht mehr:

```js
heatpump.level = 0
wallbox.r0 = false
wallbox.r1 = false
battery.charging = false
```

Damit kann ein nicht empfangener Status nicht fälschlich als OFF dargestellt werden. Auch eine Branch-A-Statusmeldung ohne verwertbare Level-/Frequenzinformation bleibt `UNKNOWN` und wird nicht mehr automatisch zu Level 0 konvertiert.

这样未收到状态时不会被错误显示成 OFF。Branch A 即使收到了状态报文，但其中没有可用的档位/频率信息，也会继续保持 `UNKNOWN`，不会再被自动转换成 Level 0。

## 5. Startup-Checks / 启动检查项

Das Dashboard zeigt folgende Checks:

- Socket
- Services
- MQTT
- Shelly / Energy Meter
- Branch A
- Branch B (gleicher Readiness-Gate wie die spätere Regelung / 与运行控制使用同一 readiness gate)
- Battery

Status:

```text
CONNECTING
LOADING SERVICES
CHECKING INITIAL STATE
READY · SAFE IDLE
READY · ACTIVE DEVICE DETECTED
HARDWARE FAULT / SAFE MODE
INITIALIZATION TIMEOUT
```

Manuelle Bedienung und AI bleiben gesperrt, solange `controlReady == false`. Der MQTT-Status wird nach den initialen Statusanforderungen ein zweites Mal abgefragt, damit ein kurzer MQTT-Verbindungs-Race beim Start nicht unnötig zum Timeout führt.

只要 `controlReady == false`，手动控制和 AI 都保持锁定。初始状态请求完成后会再次查询 MQTT 状态，以避免启动瞬间 MQTT 刚好建立连接而造成不必要的初始化超时。

## 6. Pi5 Heartbeat / Pi5 心跳

Beim Code-Review wurde gefunden, dass der Node-Backend-Pfad bislang keinen eigenen Branch-A-Pi5-Heartbeat erzeugt hat. `server/MqttService.js` publiziert nun unabhängig vom Browser alle 1 s:

```text
senergate/sys/heartbeat/pi5
```

Eigenschaften:

```text
period = 1000 ms
retain = false
source = pi5-node-backend
```

Der Heartbeat gehört zum Pi5-Backend, nicht zum Browser. Das Schließen des Dashboards darf daher nicht selbst einen ESP32-SAFE_MODE auslösen, solange der Pi5-Service lebt.

## 7. Building Twin bleibt erhalten / 保留建筑级 Building Twin

Die frühere phasenabhängige Skalierung `800/400/230` wurde aus dem REAL-Messpfad entfernt.

Gemeinsames Modell:

```text
Branch A:
1 x ATV12 + Motor -> 3 equivalent Heat Pumps

Branch B:
1 x Relay + resistor -> 2 equivalent Wallboxes
2 x Relays           -> 4 equivalent Wallboxes
```

Default Building-Twin-Basis:

```text
L1 = 240 A
L2 = 100 A
L3 = 100 A
```

Demo bei Branch A Level 5:

```text
275 / 100 / 100 A -> Estimated VUF ≈ 2.252 %
275 / 132 / 100 A -> Estimated VUF ≈ 2.018 %   (1 relay = 2 WB)
275 / 164 / 100 A -> Estimated VUF ≈ 1.848 %   (2 relays = 4 WB)
```

Diese Ströme sind **MODELED building-scale currents**, nicht Shelly-Messwerte.

这些电流属于 **建筑级模型投影值**，不是 Shelly 实测电流。

## 8. AI-Änderung / AI 修改

Der Agent erhält jetzt den totalen `currentVuf` statt des früheren `loadImpactVuf` als Haupt-KPI.

Zusätzlich werden Reduction und Compensation gemeinsam verglichen. Dadurch kann im Demo Branch B gewählt werden, wenn das Zuschalten von zwei äquivalenten Wallboxen die prognostizierte Unsymmetrie stärker verbessert als eine kleine Reduktion von Branch A.

AI 下发执行时只发送实际变化的 delta patch，不再无条件重发全部设备状态。

## 9. Geänderte / entfernte Dateien / 修改与删除文件

### Neu / 新增

```text
client/src/BuildingTwinModel.js
REAL_HARDWARE_STARTUP_INIT_CN_DE.md

tests/building_twin_model_test.mjs
tests/real_hardware_vuf_demo_test.mjs
tests/real_only_frontend_static_test.mjs
tests/startup_initialization_static_test.mjs
tests/pi5_heartbeat_static_test.mjs
tests/agent_candidate_strategy_static_test.mjs
```

### Geändert / 修改

```text
client/src/App.js
client/src/App.vue
client/src/components/SimpleDashboard.vue
client/src/components/AgentCard.vue
server/MqttService.js
tests/heatpump_command_contract_test.mjs
```

### Entfernt / 删除

```text
client/src/SimulationRuntime.js
client/src/components/SimulatedCard.vue
tests/simulation_ai_grid_test.mjs
tests/simulation_runtime_test.mjs
SIMULATION_AI_GRID_UPDATE_CN_DE.md
SIMULATION_REAL_CHANGES.md
SIMULATION_REAL_MODE_CN_DE.md
FULL_LOGIC_REBUILD_CN_DE.md
BUGFIX3_CHANGES_CN_DE.md
```

## 10. Teststatus / 测试状态

Alle Node-/Static-Tests im neuen Paket: PASS.

```text
agent_candidate_strategy_static_test.mjs PASS
agent_manual_patch_static_test.mjs       PASS
bugfix3_smoke_test.mjs                   PASS
building_twin_model_test.mjs             PASS
heatpump_command_contract_test.mjs       PASS
pi5_heartbeat_static_test.mjs            PASS
real_hardware_vuf_demo_test.mjs          PASS
real_only_frontend_static_test.mjs       PASS
startup_initialization_static_test.mjs   PASS
static_heatpump_no_legacy_path_test.mjs  PASS
vue_import_usage_static_test.mjs         PASS
```

Zusätzlich wurden die geänderten JS- und Vue-`<script setup>`-Blöcke mit `node --check` geprüft: PASS.

**Hinweis / 注意:** Ein kompletter Vite-Build konnte in dieser Arbeitsumgebung nicht abgeschlossen werden, weil `npm ci` die Frontend-Abhängigkeiten nicht vollständig installieren konnte. Der Quellcode und die projektspezifischen Tests wurden jedoch geprüft. Auf dem Pi5 bitte nach `npm ci` noch `npm run build` ausführen.

## Startup display correction / 启动显示修正

**DE:** Runtime-Daten können kurz nach dem Socket-/MQTT-Bind bereits eintreffen. Damit die Oberfläche während der laufenden Initialprüfung trotzdem eindeutig fail-closed bleibt, werden Current/Phasor/VUF-Werte bis `startup.phase === 'ready'` visuell als `— / NO DATA` ausgeblendet. Die Daten dürfen intern bereits empfangen werden; sichtbar werden sie erst nach vollständigem Startup-Check.

**中文：** Socket/MQTT 绑定后，真实状态可能很快到达。为了让初始化检查阶段在界面上仍保持明确的 fail-closed 行为，Current / Phasor / VUF 在 `startup.phase === 'ready'` 之前统一显示为 `— / NO DATA`。后台可以先收到真实数据，但必须在完整 Startup Check 通过后才显示。

Zusätzlich wurde `PhasorCard.vue` korrigiert: `Number(null) === 0` darf fehlende Spannung nicht in `0 V` oder einen Fallback-Zeiger umwandeln. / 同时修复 `PhasorCard.vue`：禁止利用 `Number(null) === 0` 把缺失电压错误转换成 `0 V` 或默认相量。

**Nicht auf null gesetzt / 不清零:** Grid-Impedanz-Preset und angenommene Phasenwinkel bleiben sichtbar, weil sie MODELED-Konfiguration und keine Runtime-Messwerte sind. / Grid Impedance preset 与假设相角属于 MODELED 配置，不是实时测量值，因此保持可见。
