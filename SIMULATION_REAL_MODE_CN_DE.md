# Senergate pi-full-stack · SIMULATION / REAL HARDWARE

## 1. Ziel / 目标

### Deutsch
Diese Version integriert den lokalen Digital Twin direkt in das bestehende `SimpleDashboard.vue`.
Die UI und die Agent-/VUF-Logik werden in beiden Modi gemeinsam verwendet. Nur die Laufzeitquelle wird umgeschaltet:

- `SIMULATION`: lokale Browser-Simulation, keine Aktor-Kommandos an MQTT/Shelly/ESP32/ATV12.
- `REAL HARDWARE`: vorhandener Socket.IO-/Pi5-Servicepfad.

### 中文
此版本把 Digital Twin 测试模式直接合并到现有 `SimpleDashboard.vue`。
两种模式共用同一套 Dashboard、VUF/CUF 计算和 Agent 逻辑，只切换数据源和执行接口：

- `SIMULATION`：浏览器本地模拟，不向 MQTT、Shelly、ESP32、ATV12 发送执行命令。
- `REAL HARDWARE`：继续使用现有 Pi5 + Socket.IO 服务链。

---

## 2. Neue Dateien / 新增文件

`client/src/SimulationRuntime.js`

Der Simulator besitzt absichtlich keine Abhängigkeit von `App.js`, Socket.IO oder MQTT.
Alle simulierten Aktoraktionen enden lokal in diesem Modul.

模拟运行时不引用 `App.js`、Socket.IO 或 MQTT。模拟模式下所有执行动作都在本地终止。

---

## 3. Gemeinsamer Datenpfad / 共用数据流

### SIMULATION

```text
SimulationRuntime
  -> simulated Shelly-like raw payload
  -> SimpleDashboard.onEnergyMeter()
  -> calibration layer
  -> Digital-Twin projection
  -> PhasorCalculator / CUF / Estimated VUF
  -> AgentCard
  -> SimulationRuntime actuator model
  -> new simulated measurement
```

### REAL HARDWARE

```text
Shelly / ESP32 / Pi5
  -> MQTT
  -> Node.js Services
  -> Socket.IO
  -> SimpleDashboard.onEnergyMeter()
  -> calibration layer
  -> Digital-Twin projection
  -> PhasorCalculator / CUF / Estimated VUF
  -> AgentCard
  -> Pi5 Services
```

---

## 4. Simulationsmodell / 模拟模型

Die lokalen Aktormodelle sind absichtlich auf die bereits im Dashboard verwendeten Agent-Konstanten abgestimmt:

- Heat pump: 5 Stufen, insgesamt max. +35 A auf Virtual L1, also +7 A/Stufe.
- Wallbox R0: +16 A auf Virtual L2.
- Wallbox R1: +16 A auf Virtual L2.
- Battery charging: +20 A auf Virtual L3.

本地执行模型与 Dashboard 中 Agent 使用的电流增量保持一致，因此 Agent 的预测与模拟后的“反馈测量”能闭环对应。

Projection bleibt:

- L1: x800
- L2: x400
- L3: x230

Im Simulationsmodus werden diese Werte als `DIGITAL TWIN SIMULATED` gekennzeichnet, nicht als echte Messung.

---

## 5. Fault Injection / 故障注入

Im SIMULATION-Modus stehen zur Verfügung:

- Balanced
- L1 Overload
- L2 Overload
- Drop L3
- Restore L3
- Reset Twin

`Drop L3` setzt Strom, PF und Spannung von L3 auf `null`.
Erwartetes Verhalten:

```text
L3 = null
-> CUF/VUF ungültig
-> NO DATA
-> keine Fail-Open-Ersetzung durch 0 A
```

---

## 6. Start / 启动

### Client

```bash
cd client
npm install
npm run dev
```

Danach die vom Vite-Server ausgegebene Browseradresse öffnen.

### SIMULATION

Standardmodus ist `SIMULATION`. Der Pi5-Server muss dafür nicht erreichbar sein.

默认启动进入 `SIMULATION`。此模式不要求 Pi5 Server 在线。

### REAL HARDWARE

Oben rechts `REAL HARDWARE` wählen.
Wenn Socket.IO/Pi5 nicht verbunden ist, zeigt die App bewusst einen Connection-Gate statt simulierte Werte als real auszugeben.

选择 `REAL HARDWARE` 后，如果 Pi5/Socket.IO 不在线，界面会显示断开状态，不会使用模拟数据伪装真实数据。

---

## 7. Tests / 测试

```bash
node tests/bugfix3_smoke_test.mjs
node tests/simulation_runtime_test.mjs
```

Erwartung:

```text
bugfix3 smoke tests: PASS
simulation runtime tests: PASS
```

Getestet wurden:

- `null` bleibt ungültig und wird nicht `0 A`.
- Battery `charging=true` bleibt eindeutig.
- Balanced Simulation 35/35/35 A.
- Battery Charging addiert lokal +20 A auf L3.
- Wallbox R0 addiert lokal +16 A auf L2.
- Heatpump 0.4 entspricht Level 2 und +14 A auf L1.
- Drop L3 publiziert `c_current=null`, `c_pf=null`, `c_voltage=null`.
- SimulationRuntime verwendet `local_only_no_mqtt`.

---

## 8. Wichtige Grenze / 重要边界

Diese Version validiert die Software-Simulation. Sie ersetzt keinen Hardware-Integrationstest mit Raspberry Pi 5, Mosquitto, Shelly, ESP32, ATV12 und PicoScope.

本版本用于软件级 Digital Twin 操作测试，不等同于 Pi5 + MQTT + Shelly + ESP32 + ATV12 + PicoScope 的真实系统集成测试。
