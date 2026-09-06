# UI Interaction and Feedback Fix / UI 交互与反馈修复

## Deutsch

Diese Version korrigiert die beobachteten Frontend-Fehler:

1. Heatpump-Balken zeigen den gewählten/pending Level sofort an.
2. Wallbox-Balken zeigen beim Ausschalten sofort den pending OFF-Zustand.
3. Battery ON/OFF zeigt direkt den pending Zielzustand.
4. Ein Klick auf Wallbox oder Battery sendet **keinen** Heatpump-STOP mehr.
5. Manuelle UI-Aktionen senden nur noch ein Partial-Patch, z. B. `{ wallbox: 2 }`, nicht mehr den kompletten, eventuell veralteten Device-State.
6. Heatpump-Kommandos verwenden nur noch `{ mode, level, target_hz }`.
7. `level 1..5` wird auf `start,10..50` gemappt.
8. PhasorCard zeigt die berechneten Load-Node-Voltages.
9. VUFCard trennt `Total estimated`, `Baseline grid` und `Load/current impact`.

## 中文

此版本修复了你截图中看到的前端交互问题：

1. Heatpump 选择档位后，蓝条立即按 pending 目标显示。
2. Wallbox 关闭后，蓝条立即按 pending OFF 显示。
3. Battery ON/OFF 点击后，按钮立即显示 pending 目标状态。
4. 点击 Wallbox 或 Battery 不再误触发 Heatpump STOP。
5. 手动 UI 操作只发送局部 patch，例如 `{ wallbox: 2 }`，不再发送整个旧 device state。
6. Heatpump 命令只使用 `{ mode, level, target_hz }`。
7. `level 1..5` 映射为 `start,10..50`。
8. PhasorCard 显示 VUF 计算后的负载端电压。
9. VUFCard 分开显示 `Total estimated`、`Baseline grid`、`Load/current impact`。

## Critical Regression Test / 关键回归测试

点击顺序：

```text
Heatpump level 2
Wallbox level 2
Battery ON
```

后端 4000 端口日志不应出现由 Wallbox/Battery 点击引起的：

```text
heatpump-> { mode: 'stop', level: 0, target_hz: 0, payload: 'stop,0' }
```

只有点击 Heatpump OFF 时才应该出现 `stop,0`。
