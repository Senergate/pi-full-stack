# Senergate pi-full-stack full logic rebuild / 完整逻辑重构说明

## Deutsch

Diese Version ist kein reiner Patch, sondern eine bereinigte Neuordnung der aktiven Steuerlogik:

1. `SIMULATION` ist wirklich lokal: Socket.IO wird erst bei `REAL HARDWARE` aufgebaut.
2. `REAL HARDWARE` verwendet weiterhin die A-Netzkonfiguration `10.20.0.200:4000`.
3. Heatpump-Befehle nutzen ausschließlich den Objektvertrag `{ mode, level, target_hz }`.
4. Numeric normalized load `0..1` wird im Execution-Pfad abgelehnt.
5. Mapping ist eindeutig: OFF=`stop,0`, ZERO_HOLD=`start,0`, level 1..5=`start,10..50`.
6. Manual UI actions senden nur Patches: `{ wallbox: 2 }` oder `{ batteryCharging: true }` stoppt die Heatpump nicht mehr.
7. Actual state, commanded state, ACK und status sind getrennt.
8. Vue zeigt Pending-Zielwerte sofort an, bestätigt aber erst durch Branch-/Shelly-/Battery-Feedback.
9. Branch-A/Branch-B ACK wird vom Server an Vue weitergegeben und im Agent angezeigt.
10. PhasorCard zeigt Load-Node-Voltage, nicht nur Source-Voltage.
11. VUF wird als Total/Baseline/Load-impact getrennt angezeigt.
12. Agent blockiert Auto-Control bei stale Messdaten oder fehlendem/fehlerhaftem Branch-A-Status.
13. `AgentCard.vue` verwendet einen vollständigen, expliziten Vue-Import: `computed, nextTick, onMounted, onUnmounted, reactive, ref, watch`.

## 中文

这个版本不是单纯补丁，而是把当前主动控制链路重新理清：

1. `SIMULATION` 真正本地运行，只有切到 `REAL HARDWARE` 才建立 Socket.IO。
2. `REAL HARDWARE` 继续使用 A 的网络配置：`10.20.0.200:4000`。
3. Heatpump 命令只允许 `{ mode, level, target_hz }` 对象合同。
4. 执行路径拒绝旧的 `0..1` normalized load。
5. 映射明确：OFF=`stop,0`，ZERO_HOLD=`start,0`，level 1..5=`start,10..50`。
6. 手动 UI 操作只发送局部 patch：点击 Wallbox 或 Battery 不会再附带 Heatpump=0，也不会误触发 `stop,0`。
7. Actual state、commanded state、ACK、status 分离。
8. Vue 立即显示 pending 目标，但真实确认来自 Branch/Shelly/Battery 反馈。
9. Branch-A/Branch-B ACK 从 Server 转发到 Vue，并在 Agent 区域显示。
10. PhasorCard 显示 load-node voltage，而不是只显示 source voltage。
11. VUF 拆成 Total/Baseline/Load-impact。
12. 测量过期或 Branch-A 状态缺失/故障时，Agent 自动控制被阻止。
13. `AgentCard.vue` 的 Vue import 已完整显式列出：`computed, nextTick, onMounted, onUnmounted, reactive, ref, watch`。

## AgentCard.vue Vue import check / AgentCard.vue 导入检查

```js
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
```

| Function | Status | 中文说明 | Deutsch |
|---|---|---|---|
| computed | used | 用于派生状态、显示状态、VUF、cooldown、feedback | wird für abgeleitete Zustände, Anzeige, VUF, Cooldown und Feedback genutzt |
| nextTick | used | 日志更新后滚动到顶部 | Scroll nach Log-Update |
| onMounted | used | 启动 Agent 定时器 | startet Agent-Timer |
| onUnmounted | used | 清理 Agent 定时器 | räumt Agent-Timer auf |
| reactive | used | pendingDevices / pendingTargetState | pendingDevices / pendingTargetState |
| ref | used | autoEnabled、prediction、logs、timer 等 | autoEnabled, prediction, logs, timer usw. |
| watch | used | actual state、vuf、controlReady 变化监听 | Watcher für actual state, VUF und controlReady |

`tests/vue_import_usage_static_test.mjs` 会检查 Vue Composition API 函数是否“使用了但未 import”。
