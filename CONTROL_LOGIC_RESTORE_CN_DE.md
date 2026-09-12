# Senergate REAL HARDWARE – Control Logic Regression Fix
# Senergate REAL HARDWARE——控制逻辑回归修复

**Date / 日期:** 2026-09-10

## 1. Fehlerbild / 故障现象

**DE:** Nach dem Start waren keine realen Aktoren aktiv, trotzdem zeigte die Building-Twin-Stromanzeige feste Ströme. Nach einem Branch-B-Schaltbefehl wurden andere Bedienelemente für mehrere Sekunden blockiert, bis ein neuer Shelly-Status eintraf.

**中文：** 系统启动后没有开启真实设备，但 Building-Twin 电流仍显示固定非零值；控制 Branch-B 一个电阻后，其他设备被锁定数秒，直到下一次 Shelly Relay Status 返回。

## 2. Ursache 1 – künstlicher Grundstrom / 原因1——固定建筑基线电流

Vorher / 修改前:

```text
baseCurrentA = 240 / 100 / 100 A
```

Dadurch waren die Ströme auch bei allen Geräten OFF ungleich Null.

现在改为：

```text
baseCurrentA = 0 / 0 / 0 A
```

Damit gilt:

```text
Heatpump OFF + Relay0 OFF + Relay1 OFF + Battery OFF
=> projected current = 0 / 0 / 0 A
```

## 3. Building-Twin Projektion / 建筑级投影

Die vorher im Prototype verwendeten Demo-Gains bleiben ausschließlich als MODELED Building-Twin-Projektion erhalten:

```text
L1 x 800
L2 x 400
L3 x 230
```

Sie werden nur angewendet, wenn das zugehörige reale Gerät aktiv ist. OFF bedeutet immer 0 A.

```text
Branch A OFF          -> L1 projected = 0 A
Branch A active       -> measured L1 x 800

Branch B both OFF     -> L2 projected = 0 A
Branch B relay active -> measured L2 x 400

Battery OFF           -> L3 projected = 0 A
Battery active        -> measured L3 x 230
```

Die Faktoren sind Demo-/Building-Twin-Gains, keine Shelly-Messkalibrierung.

## 4. Ursache 2 – Branch-B-Befehl setzte Status auf null / 原因2——控制 Relay 时状态被清空

Vorher:

```js
_.wallbox.r0 = null;
_.wallbox.r1 = null;
WallboxService.set(...);
```

Da `controlReady` gleichzeitig `branchBReady` verlangte, wurde sofort das gesamte Bedienfeld blockiert.

现在：

```js
if (_.wallbox.r0 !== targetR0) WallboxService.set(0, targetR0);
if (_.wallbox.r1 !== targetR1) WallboxService.set(1, targetR1);
```

Der letzte bestätigte Zustand bleibt sichtbar, bis Shelly den neuen Zustand meldet.

## 5. Control Gate wieder wie vorher / 控制门控恢复到之前逻辑

Jetzt wieder:

```js
controlReady = measurementFresh && branchAReady
```

Nicht mehr:

```text
startup READY
AND measurement fresh
AND Branch A ready
AND Branch B fresh
```

Damit blockiert ein verzögerter Branch-B-Shelly-Status nicht Heatpump oder Battery.

## 6. Startup Check / 启动检查

Startup prüft weiterhin:

```text
Socket
Services
MQTT
Shelly measurement
Branch A
Branch B relay 0/1
Battery
```

Für den Systemstart zwingend sind jedoch nur die Core-Komponenten:

```text
Socket + Services + MQTT + Shelly measurement + Branch A
```

Branch B und Battery werden weiter angezeigt und nachgeführt, blockieren aber den Core-Start nicht.

## 7. Tests / 测试

Alle Tests PASS, einschließlich neuer Regressionstests:

```text
building_twin_model_test.mjs                 PASS
control_regression_restore_static_test.mjs   PASS
real_hardware_vuf_demo_test.mjs              PASS
startup_initialization_static_test.mjs       PASS
branchb_shelly_readiness_static_test.mjs     PASS
```

Zusätzlich: JS- und Vue-`<script setup>` Syntax Checks PASS.

## 8. Erwartetes Verhalten / 预期行为

```text
Start
↓
alle Aktoren OFF
↓
projected currents = 0 / 0 / 0 A
↓
Heatpump / Relay / Battery können unabhängig bedient werden
↓
Branch-B-Befehl
↓
letzter bestätigter Relay-State bleibt erhalten
↓
andere Geräte bleiben sofort bedienbar
↓
Shelly-Status bestätigt später den neuen Relay-State
```
