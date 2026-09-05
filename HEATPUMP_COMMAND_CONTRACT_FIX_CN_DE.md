# Heatpump Command Contract Fix / Heatpump 命令合同修复

## Deutsch

Diese Version korrigiert die P0-Bugs aus der bekannten Bugliste:

- OFF publiziert `stop,0`.
- ZERO_HOLD publiziert `start,0`.
- Level 1..5 publiziert `start,10` .. `start,50`.
- Der Execution-Pfad akzeptiert keine normierte numerische Last `0..1` mehr.
- Real-Feedback schreibt nur noch in den Actual-State und triggert keinen neuen Heatpump-Befehl über einen Watcher.
- Agent Auto-Control wird blockiert, wenn Real-Hardware-Status oder Messdaten nicht frisch sind.
- PhasorCard zeigt jetzt die berechnete Load-Node-Voltage aus `vufResult.loadVoltageMagnitudes`.
- VufCard zeigt Total Estimated VUF, Baseline Grid VUF und Controllable VUF Impact getrennt.

## 中文

此版本修复已知 Bug 清单中的 P0 问题：

- OFF 发布 `stop,0`。
- ZERO_HOLD 发布 `start,0`。
- Level 1..5 发布 `start,10` .. `start,50`。
- 执行路径不再接受 `0..1` normalized numeric load。
- 真实 ESP32 status 只更新 actual state，不再通过 watcher 触发新的 Heatpump 命令，避免 echo bug。
- Real Hardware 状态或测量数据不新鲜时，Agent 自动控制被阻止。
- PhasorCard 改为显示 `vufResult.loadVoltageMagnitudes` 计算后的负载端电压。
- VufCard 分开显示 Total Estimated VUF、Baseline Grid VUF、Controllable VUF Impact。

## Command API

```js
EspService.heatpump({
  mode: 'start',      // 'start' | 'stop' | 'zero_hold'
  level: 3,           // UI level 0..5
  target_hz: 30       // VFD frequency in Hz
});
```

## Payload Matrix

| UI / Agent | MQTT payload |
|---|---|
| OFF | `stop,0` |
| ZERO_HOLD | `start,0` |
| level 1 | `start,10` |
| level 2 | `start,20` |
| level 3 | `start,30` |
| level 4 | `start,40` |
| level 5 | `start,50` |
