# Senergate Building-Twin + Runtime Isolation Update
# Senergate 建筑级数字孪生 + Real/Simulation 隔离更新

**Version / 版本:** 2026-09-09

## 1. Ziel / 目标

**DE:** Real Hardware und Simulation verwenden jetzt dieselbe Building-Twin-Abbildung. Kleine Prototype-Ströme bleiben Messwahrheit; die VUF-Demo nutzt explizite Gebäudeprojektionen aus Gerätezuständen.

**中文：** Real Hardware 与 Simulation 现在共用同一套 Building-Twin 映射逻辑。Prototype 的小电流继续保持为测量真值；VUF 演示通过设备状态生成明确的建筑级投影电流。

## 2. Gemeinsames Gerätemodell / 共用设备模型

- Branch A: `1 x ATV12 + Motor -> 3 x Heat Pump equivalent`
- Branch B: `1 x Relay + Resistor -> 2 x Wallbox equivalent`
- Branch B: `2 x Relays -> 4 x Wallbox equivalent`
- Shelly current: **MEASURED**, not multiplied by 800/400/230
- Building current: **DIGITAL TWIN / MODELED**
- VUF: **MODEL-ESTIMATED VUF**

Zentrale Datei / 核心文件:

```text
client/src/BuildingTwinModel.js
```

Default building-scale demo base:

```text
L1 = 260 A
L2 = 100 A
L3 = 100 A
```

Branch A full-load contribution:

```text
Heatpump level 5 -> +35 A on L1
=> 295 / 100 / 100 A
```

Branch B compensation:

```text
Relay 0 ON -> +32 A on L2 -> 295 / 132 / 100 A
Relay 1 ON -> +32 A on L2 -> 295 / 164 / 100 A
```

With the current Typical Building Feeder model:

```text
295 / 100 / 100 A -> VUF 2.268 %
295 / 132 / 100 A -> VUF 2.077 %
295 / 164 / 100 A -> VUF 1.956 %
```

## 3. Warum 800/400/230 entfernt wurde / 为什么移除 800/400/230

**DE:** Unterschiedliche Faktoren pro Phase wurden aus dem REAL-PCC-Strompfad entfernt. Sie vermischten Messwerte und Gebäudemodell. Simulation verwendet nur noch einen gemeinsamen kleinen Sensor-Skalierungsfaktor intern, während die Gebäudeprojektion immer über das gleiche Gerätemodell erfolgt.

**中文：** 已从 REAL PCC 电流路径中移除按相的 800/400/230 倍率，因为这会混淆测量层与建筑模型层。Simulation 内部仅用一个统一的小型 sensor scale 生成传感器样数据，而建筑级投影始终通过同一个设备模型计算。

## 4. Runtime-Wechsel / 模式切换

Es wurde die kleinste und sicherste Variante gewählt: **CLEAR + ALL OFF**.

选择了代码量更小、行为更安全的方案：**清零 + 全部关闭**。

Beim Wechsel / 切换时:

```text
Outgoing runtime
  -> Heatpump STOP
  -> Wallbox Relay 0 OFF
  -> Wallbox Relay 1 OFF
  -> Battery OFF
  -> listeners unbind
  -> UI/runtime data clear
  -> incoming runtime bind
```

Simulation nutzt `SimulationRuntime.shutdown()` / `resetAllOff()`.

REAL sendet die OFF/STOP-Kommandos vor dem Socket-Disconnect.

## 5. Keine Datenvermischung / 防止数据混用

- Alte UI-Messwerte werden beim Moduswechsel gelöscht.
- AgentCard wird durch `:key="App._.mode"` neu gemountet; AI/Pending-State wird nicht zwischen Modi übernommen.
- Event-Callbacks prüfen `payloadMatchesActiveMode()` und ignorieren verspätete Daten des inaktiven Runtime-Pfads.
- Real und Simulation verwenden getrennte Service-/Emitter-Pfade.

## 6. AI/VUF-Korrektur / AI/VUF 修正

Der Agent erhält jetzt den **total model-estimated VUF** statt `loadImpactVuf`. Dadurch ist der reproduzierbare `> 2 %`-Test konsistent mit der VUF-Anzeige.

Agent 现在使用 **total model-estimated VUF**，不再使用 `loadImpactVuf` 作为主触发值，因此 `>2%` 演示与 VUF 卡片一致。

Branch-B-Kandidaten behandeln `0..3` als Relay-Bitmask. Ein aktiver Relay kann einzeln aus-/eingeschaltet werden; `mask 1 -> mask 3` ist möglich.

## 7. Geänderte Dateien / 修改文件

```text
client/src/BuildingTwinModel.js                  NEW
client/src/SimulationRuntime.js
client/src/components/SimpleDashboard.vue
client/src/components/AgentCard.vue

tests/building_twin_model_test.mjs              NEW
tests/runtime_mode_isolation_static_test.mjs    NEW
tests/simulation_ai_grid_test.mjs
tests/simulation_runtime_test.mjs
```

## 8. Tests / 测试

Alle vorhandenen und neuen Node-Tests PASS:

```text
agent_manual_patch_static_test.mjs             PASS
bugfix3_smoke_test.mjs                         PASS
building_twin_model_test.mjs                   PASS
heatpump_command_contract_test.mjs             PASS
runtime_mode_isolation_static_test.mjs         PASS
simulation_ai_grid_test.mjs                    PASS
simulation_runtime_test.mjs                    PASS
static_heatpump_no_legacy_path_test.mjs        PASS
vue_import_usage_static_test.mjs               PASS
```

Zusätzlich wurden JS-/Vue-script Syntax-Checks ausgeführt: PASS.

## 9. Hinweis / 注意

Diese Version ändert bewusst nur die Building-Twin-/Runtime-Isolation und die dafür notwendige VUF-/Branch-B-Logik. Andere im Audit dokumentierte Punkte (z. B. formaler Branch-A-Commandpfad, vollständige ACK/Timeout-State-Machine, PF-/Phasor-Qualität) bleiben separate Folgeschritte.
