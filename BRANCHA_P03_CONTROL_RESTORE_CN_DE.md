# Senergate Branch A – P03 Control Semantics Restore
# Senergate Branch A——P03 控制语义恢复

**Version / 版本:** v1.2 · 2026-09-11

## 1. Ziel / 目标

**DE:** Diese Version übernimmt die bewährte Branch-A-Steuersemantik aus `pi-full-stack_P03_AI_Delta_ZERO_HOLD_fixed(1).zip` zurück in die aktuelle REAL-HARDWARE-/Equivalent-Device-Twin-Architektur. Backend/MQTT-Vertrag bleibt unverändert; ein erneutes Flashen des ESP32 ist für diese Pi5-Version nicht erforderlich.

**中文：** 本版本把 `pi-full-stack_P03_AI_Delta_ZERO_HOLD_fixed(1).zip` 中已经验证正常的 Branch-A 前端控制语义移植回当前 REAL-HARDWARE / Equivalent-Device-Twin 架构。Backend/MQTT 合同不变，本 Pi5 版本不要求重新刷 ESP32。

## 2. Behobene Regression / 修复的回归

Vorher / 之前：

```text
Pi5 sendet start,50
ESP32 status: STARTING, target=0, actual=0
Frontend: Heatpump 0/5
Building Twin: L1=0 A
Pending: Timeout
```

Jetzt / 现在：

```text
Pi5 sendet start,50
ESP32 status: STARTING, target=0, actual=0
+ aktiver Pi5-Befehl start,50

Execution confirmation: 0/5 (noch nicht physisch bestätigt)
Pending display:       5/5 · START
Building Twin:         Level 5 -> 35 A

später RUNNING/RFRD=50:
Execution confirmation -> 5/5
Pending -> bestätigt
```

## 3. State-aware Branch-A Adapter / 状态感知 Branch-A Adapter

`client/src/HeatpumpStatusAdapter.js`

- `STOP/READY/SAFE_MODE/FAULT` -> STOP, Level 0, Twin Level 0
- `ZERO_HOLD/RAMPING_TO_ZERO_HOLD` -> ZERO_HOLD, Level 0, Twin Level 0
- `STARTING` -> Building Twin benutzt `effective_target_hz`, LFRD (>2 Hz) oder den aktuell gesendeten Pi5-Startbefehl als Modellziel.
- `RUNNING` -> reale `actual_output_frequency_hz/RFRD` hat Vorrang, sobald sie >2 Hz ist.
- `confirmedLevel` und `twinLevel` sind getrennt. Ein Sollwert gilt nicht automatisch als physisch ausgeführt.

中文：

- STOP/READY/SAFE_MODE/FAULT 强制 Level 0；过期频率不能覆盖本地安全状态。
- ZERO_HOLD 与 STOP 保持不同语义。
- STARTING 时，若 LFRD/RFRD 仍为 0，可用当前 Pi5 `start,x` 命令作为 Building Twin 的有效目标，因此模拟电流不会错误掉到 0 A。
- RUNNING 后优先使用实际 RFRD/actual frequency。
- `confirmedLevel` 与 `twinLevel` 分开：模型目标不等于物理执行确认。

## 4. P03 STOP / ZERO_HOLD Semantik / P03 STOP / ZERO_HOLD 语义

恢复 / Wiederhergestellt:

```text
Level 1..5 -> start,10..50
AI/Level 0 -> ZERO_HOLD -> start,0
Manual STOP -> stop,0
Manual ZERO HOLD -> start,0
```

UI 中重新提供两个独立按钮：`STOP` 和 `ZERO HOLD`。

## 5. Pending Confirmation / Pending 确认

恢复 P03 的双条件确认：

```text
Heatpump Pending bestätigt nur wenn:
Level matches
AND
Mode matches (START / ZERO_HOLD / STOP)
```

移除固定 3 s / 12 s 的 Heatpump execution timeout。VFD 启动过程不再因为固定短超时被误报失败。新的命令仍可以替换旧 Pending target，因此不会锁死手动操作。

## 6. Building Twin / Building Twin

`projectBuildingCurrents()` 继续使用当前 Equivalent-Device 模型：

- Branch A Level 5 -> 35 A modeled current
- Branch B mask 3 -> 64 A modeled current
- Battery ON -> 20 A modeled current
- 全部 OFF/ZERO_HOLD -> 0 A controlled contribution

没有恢复 `800/400/230`。

## 7. Backend / 后端

`server/EspService.js` 不需要回滚：

```text
start level 3 -> start,30
start level 5 -> start,50
ZERO_HOLD     -> start,0
STOP          -> stop,0
```

本版本主要修复 Frontend Branch-A control/status contract。

## 8. Tests / 测试

19 个 Node/static/regression tests 全部 PASS，包括新增：

- `p03_branchA_semantics_restore_test.mjs`
- `branchA_status_target_projection_test.mjs`
- `branchA_status_adapter_static_test.mjs`
- 更新后的 `pending_timeout_static_test.mjs`

关键回归：

```text
STARTING target=0 actual=0 + command start,50
confirmedLevel = 0
Twin Level     = 5
Building L1    = 35 A

RUNNING actual=50
confirmedLevel = 5
Twin Level     = 5

STOP + stale 50 Hz
confirmedLevel = 0
Twin Level     = 0
```
