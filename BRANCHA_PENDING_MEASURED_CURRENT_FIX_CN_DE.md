# Branch-A Pending + Shelly Measured Current Fix / Branch-A Pending 与 Shelly 实测电流修复

## Deutsch

Diese Version korrigiert den Branch-A-Datenpfad und erweitert die Phase-Current-Karte:

- Branch-A Building-Twin-Level folgt `target_frequency_hz` / LFRD, nicht der verzögerten RFRD-Istfrequenz.
- `STARTING + target=40 Hz + actual=0 Hz` wird als Heatpump-Level 4 erkannt und erzeugt 28 A modellierten L1-Strom.
- STOP/READY/SAFE_MODE/FAULT/ZERO_HOLD überschreiben stale Frequenzwerte weiterhin auf Modell-Level 0.
- Pending-Timeouts sind gerätespezifisch: Heatpump 12 s, Wallbox 3 s, Battery 3 s.
- Sobald Branch-A-Status den Target-Level bestätigt, wird Pending sofort bestätigt; es wird nicht auf das Erreichen der physischen RFRD-Frequenz gewartet.
- Heatpump-Karte zeigt Execution State, Target Hz und Actual Hz.
- `Phase Currents` zeigt Shelly-Messströme separat als `SHELLY · MEASURED`; die Balken bleiben `BUILDING TWIN · MODELED`.
- Branch B bleibt direkt Shelly-basiert und blockiert nicht die globale Steuerfreigabe.
- REAL-HARDWARE-only, kein SimulationRuntime-Pfad.

## 中文

本版本修复 Branch A 状态链路，并扩展 Phase Currents 显示：

- Building Twin 的 Heatpump Level 优先使用 `target_frequency_hz` / LFRD，不再被滞后的 RFRD 实际频率覆盖。
- `STARTING + target=40 Hz + actual=0 Hz` 会正确映射为 Heatpump Level 4，并生成 L1=28 A 的模型电流。
- STOP / READY / SAFE_MODE / FAULT / ZERO_HOLD 仍然优先，强制模型 Level=0，防止 stale frequency 重新激活负载。
- Pending timeout 按设备区分：Heatpump 12 s、Wallbox 3 s、Battery 3 s。
- Branch-A status 一旦确认目标档位，就立即确认 Pending；不需要等待实际 RFRD 达到目标频率。
- Heatpump 卡片显示 Execution State、Target Hz 和 Actual Hz。
- `Phase Currents` 中新增 `SHELLY · MEASURED` 实测电流行；柱状图继续表示 `BUILDING TWIN · MODELED`。
- Branch B 继续直接通过 Shelly Relay 0/1，不参与全局 controlReady 锁定。
- 只保留 REAL HARDWARE，无 SimulationRuntime。

## Erwartetes Beispiel / 预期示例

```text
Command: start,40
Branch-A status: STARTING, target_frequency_hz=40, actual_output_frequency_hz=0

Current device state:
Heat pump 4/5
STARTING · target 40.0 Hz · actual 0.0 Hz

Building Twin:
L1 = 28 A

Shelly measured row:
L1/L2/L3 = real calibrated Shelly currents
```

## Tests

15 Node/static tests plus JS/Vue `<script setup>` syntax checks: PASS.

A complete `npm run build` was not executed in the generation environment because `npm ci` timed out. Run on Pi5:

```bash
cd ~/projects/pi-full-stack/client
npm ci
npm run build
```
