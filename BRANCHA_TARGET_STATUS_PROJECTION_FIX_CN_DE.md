# Branch-A Target-Status Projection Fix / Branch-A 目标状态投影修复

## 中文

问题根因：`SimpleDashboard.vue` 原先在解析 Branch-A status 时优先使用 `actual_output_frequency_hz`。在 ATV12 处于 `STARTING` 时，实际频率 `RFRD` 可能仍为 0 Hz，而目标频率 `LFRD/target_frequency_hz` 已经是 40 Hz。由于代码先拿到 actual=0，就不会继续使用 target=40，因此 `heatpump.level` 被保持为 0。Building Twin 随后计算 L1=0 A，Voltage Phasor 和 Estimated VUF 都不会随 Heatpump 命令变化。

修复：新增 `client/src/HeatpumpStatusAdapter.js`，明确区分：

- `target_frequency_hz / LFRD`：Branch-A 已确认的目标设定值，用于 Building-Twin 等效设备负载模型。
- `actual_output_frequency_hz / RFRD`：ATV12 延迟的实际频率反馈，仅用于执行诊断；只有目标信息不存在时才作为模型 fallback。
- `STOP / READY / SAFE_MODE / FAULT / ZERO_HOLD`：本地状态优先，强制 Building-Twin Heatpump Level=0，避免 stale frequency 重新激活模型负载。

因此：

```text
STARTING, target=40 Hz, actual=0 Hz
-> model level = 4
-> Branch A projected current = 28 A
```

当 Branch B Relay0=ON、Battery=ON 时：

```text
Projected current = 28 / 32 / 20 A
```

而不是之前的：

```text
0 / 32 / 20 A
```

Backend `EspService.heatpump()` 仍只表示 Pi5 已接受并发布命令；Building Twin 不直接使用 backend return 作为执行事实，而是等待新的 Branch-A status，并从 status 中的 target/LFRD 推导模型等级。

## Deutsch

Fehlerursache: `SimpleDashboard.vue` priorisierte beim Branch-A-Status `actual_output_frequency_hz`. Während `STARTING` kann RFRD noch 0 Hz melden, obwohl `target_frequency_hz` bzw. LFRD bereits 40 Hz beträgt. Dadurch blieb `heatpump.level` auf 0 und das Building-Twin-Modell berechnete weiterhin 0 A auf L1. Entsprechend änderten sich weder Voltage Phasor noch Estimated VUF.

Korrektur: Neue Datei `client/src/HeatpumpStatusAdapter.js` mit klarer Semantik:

- `target_frequency_hz / LFRD`: bestätigter Branch-A-Sollwert; treibt das äquivalente Building-Twin-Lastmodell.
- `actual_output_frequency_hz / RFRD`: verzögerte Ist-Rückmeldung des ATV12; Diagnosewert und nur Fallback, wenn kein Sollwert vorhanden ist.
- `STOP / READY / SAFE_MODE / FAULT / ZERO_HOLD`: lokaler Zustand hat Vorrang und setzt den modellierten Heatpump-Level auf 0.

Beispiel:

```text
STARTING, target=40 Hz, actual=0 Hz
-> Modell-Level 4
-> Branch-A-Projektionsstrom 28 A
```

Alle bestehenden Tests sowie zwei neue Regressionstests laufen erfolgreich durch.
