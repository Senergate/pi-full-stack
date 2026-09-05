# Real Hardware State Sync Fix / REAL HARDWARE 真实状态同步修复

## Deutsch

Dieser Patch behebt den Bug, dass nach dem Umschalten von `SIMULATION` zurück auf `REAL HARDWARE` die Karte `Current device state` lokale oder zurückgesetzte Werte (`0/5`, `0/3`, `OFF`) anzeigt, obwohl reale Messströme vorhanden sind.

### Was wurde geändert?

1. `SimpleDashboard.vue` trennt jetzt unbekannte Real-Hardware-Zustände von echten `0`-Zuständen. `null` wird nicht mehr als `0` dargestellt.
2. Beim Wechsel zu `REAL HARDWARE` wird der lokale Simulationszustand auf `waiting` gesetzt, bis reale Rückmeldungen kommen.
3. `SimpleDashboard.vue` hört jetzt auf `EspService.branchA` und `EspService.branchB`.
4. Branch-A-Status wird auf den Heatpump-Anzeigestatus zurückgeführt. Beispiel: `target_frequency_hz=8` oder `actual_output_frequency_hz=8` wird zu `load=0.8` und damit zu `4/5` in der bestehenden Legacy-UI.
5. Branch-B-Status wird flexibel auf `r0/r1` abgebildet, wenn passende Relay-Felder vorhanden sind.
6. `AgentCard.vue` kann unbekannte Zustände als `--` anzeigen und blockiert automatische Aktionen, bis alle Device-States bekannt sind.
7. Pending-Anzeige und ZERO-HOLD-Button wurden wieder hergestellt.
8. `EspService.heatpump(load, mode)` unterscheidet `stop`, `zero_hold` und `start`.
9. `SimulationRuntime.EspService.heatpump(load, mode)` akzeptiert denselben Mode wie der Real-Pfad.

## 中文

这个补丁修复的问题是：从 `SIMULATION` 切回 `REAL HARDWARE` 后，`Current device state` 显示本地默认值或仿真重置值，例如 `0/5`、`0/3`、`OFF`，但现场实际测得电流仍然存在。

### 修改内容

1. `SimpleDashboard.vue` 现在区分“真实硬件状态未知”和“真实硬件确实为 0”。`null` 不再被当成 0 显示。
2. 切换到 `REAL HARDWARE` 时，先显示等待状态，直到收到真实反馈。
3. `SimpleDashboard.vue` 现在监听 `EspService.branchA` 和 `EspService.branchB`。
4. Branch-A status 会回填 Heatpump 显示状态。例如 `target_frequency_hz=8` 或 `actual_output_frequency_hz=8` 会映射为 `load=0.8`，在当前 legacy UI 中显示 `4/5`。
5. Branch-B status 如果包含 relay 字段，会回填 `r0/r1`。
6. `AgentCard.vue` 能把未知状态显示为 `--`，并在设备状态未知时阻止自动控制动作。
7. 恢复 pending 显示和 ZERO-HOLD 按钮。
8. `EspService.heatpump(load, mode)` 区分 `stop`、`zero_hold`、`start`。
9. `SimulationRuntime.EspService.heatpump(load, mode)` 与 Real 路径使用同样的 mode 参数。

## MQTT debug

```bash
mosquitto_sub -h localhost -p 1883 -t 'senergate/#' -v
mosquitto_sub -h localhost -p 1883 -t 'senergate/state/branchA/status' -v
mosquitto_sub -h localhost -p 1883 -t 'senergate/state/branchB/status' -v
```

If MQTT status arrives but the UI still shows `--`, check the field names in the JSON and extend `onBranchAStatus()` or `readRelay()`.
