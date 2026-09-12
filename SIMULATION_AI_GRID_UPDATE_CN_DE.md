# Senergate Simulation Update · AI TEST >2% + Grid Impedance Panel

## 中文
本次更新只作用于 SIMULATION 路径，不会向真实 MQTT / Shelly / ESP32 / ATV12 发送控制命令。

新增：
- `AI TEST > 2%` 固定测试场景。
  - Base projected currents: 260 / 84 / 100 A
  - Initial device state: Heatpump Level 5, Wallbox Level 1, Battery Charging OFF
  - Initial total projected currents: 295 / 100 / 100 A
  - 使用 `Typical Building Feeder / MODELED` 时，Estimated VUF 稳定超过 2%，用于触发 AI CONTROL ON 闭环。
- Grid Impedance 控制面板：
  - R_phase / X_phase
  - R_N / X_N
  - Stiff LV / Typical Feeder / Weak Feeder 三个 MODELED preset
  - 显示 |Z_phase|、|Z_N|、|V_N|
- VUF 模型加入中性点位移：
  - I_N = I_A + I_B + I_C
  - V_N = Z_N · I_N
  - V_AN = E_A - Z_A I_A - V_N（B/C 同理）
- 所有 Grid 参数仍标记为 MODELED；VUF 仍标记为 ESTIMATED。

重要：这些 preset 是软件演示参数，不是当前现场实测或校准的 Grid Impedance。

## Deutsch
Dieses Update wirkt ausschließlich im SIMULATION-Pfad. Es werden keine realen MQTT-, Shelly-, ESP32- oder ATV12-Aktorbefehle gesendet.

Neu:
- Festes, reproduzierbares Szenario `AI TEST > 2%`.
  - Basisströme (projiziert): 260 / 84 / 100 A
  - Anfangszustand: Wärmepumpe Level 5, Wallbox Level 1, Battery Charging OFF
  - Gesamtströme zum Start: 295 / 100 / 100 A
  - Mit `Typical Building Feeder / MODELED` liegt Estimated VUF reproduzierbar über 2 % und aktiviert damit den AI-CONTROL-Regelpfad.
- Grid-Impedance-Bedienfeld:
  - R_phase / X_phase
  - R_N / X_N
  - MODELED-Presets: Stiff LV / Typical Feeder / Weak Feeder
  - Anzeige von |Z_phase|, |Z_N| und |V_N|
- Neutralpunktverschiebung im VUF-Modell:
  - I_N = I_A + I_B + I_C
  - V_N = Z_N · I_N
  - V_AN = E_A - Z_A I_A - V_N (analog B/C)
- Grid-Impedance bleibt MODELED; VUF bleibt ESTIMATED.

Wichtig: Die Presets sind reine Software-Demoparameter und keine gemessenen oder kalibrierten Netzimpedanzen des realen Standorts.
