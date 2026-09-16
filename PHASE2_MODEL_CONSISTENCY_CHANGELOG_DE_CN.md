# Senergate v1.5.1 B – Phase 2 Model Consistency Fix

## Deutsch

Diese Revision behebt drei Punkte aus Phase 2 der Modellkonsistenz:

1. **Heatpump Current-State Live P/Q**
   - Der aktuelle VUF-Zustand der Heatpump folgt nun dem live gemessenen Shelly-L1-Strom.
   - Wenn eine gültige OFF-Baseline mit P/Q vorliegt, wird inkrementelles Shelly-P/Q auf Building-Twin-Maßstab skaliert.
   - Ohne gültige P/Q-Baseline wird das Heatpump-P/Q-Profil mit dem live gemessenen Strom relativ zu 0,26 A skaliert.
   - Kandidaten für zukünftige Heatpump-Level bleiben profilbasiert.

2. **Counterfactual Freeze unveränderter Assets**
   - `predictVufForDeviceState()` startet vom aktuellen physikalischen Live-P/Q-Modell.
   - Nur das tatsächlich veränderte Asset wird durch den Ziel-Profilpunkt ersetzt.
   - Unveränderte Heatpump/Wallbox/Battery behalten ihr aktuelles Live-P/Q.
   - Dadurch enthält `ΔVUF` keinen künstlichen Sprung durch einen Modellwechsel eines unveränderten Assets.

3. **Battery Stabilization Confidence**
   - Stabilität wird nicht mehr nur über Sample Count + ΔI entschieden.
   - HIGH Confidence benötigt zusätzlich eine zusammenhängende stabile Zeitspanne und eine kleine Stromsteigung.
   - Intern: Min settle 3 s, ΔI ≤ 0,02 A, 3 stabile Updates, stable duration ≥ 1,0 s, |dI/dt| ≤ 0,02 A/s, max settle 10 s.
   - Timeout führt zu `LOW` Confidence; aktuelle Live-Messwerte werden weiter für Current-State-VUF verwendet.

### Regression

- 47/47 `.mjs` Tests PASS.
- JavaScript Syntax: PASS.
- Vue `<script setup>` Syntax: PASS für `SimpleDashboard.vue`, `AgentCard.vue`, `VufCard.vue`.
- Kein vollständiger Vite Production Build, da `client/node_modules` im gelieferten Quellpaket nicht enthalten ist.

### Empfohlene HIL-Prüfung

- Heatpump Level konstant halten und reale L1-Stromrampe beobachten: Current Card und Current-State-VUF müssen im selben Messzyklus reagieren.
- Nur Heatpump-Kandidat ändern und prüfen, dass Wallbox/Battery-P/Q im Predictor unverändert bleibt.
- Battery einschalten: HIGH Confidence darf erst nach Min-Settle + Sample Count + Stable Duration + Slope-Kriterium entstehen.
- Bei >10 s ohne Stabilität muss LOW Confidence gemeldet werden, ohne den Regler dauerhaft zu blockieren.

---

## 中文

这一版解决 Phase 2 的三个模型一致性问题：

1. **Heatpump 当前状态 Live P/Q**
   - Heatpump 当前 VUF 现在跟随 Shelly L1 实时电流。
   - 如果存在有效 OFF 基线 P/Q，则使用增量 Shelly P/Q 并缩放到 Building Twin。
   - 如果没有有效 P/Q 基线，则按照实时电流相对 0.26 A 的比例缩放 Heatpump 完整 P/Q Profile。
   - 对未来 Heatpump 档位的候选预测仍然使用 Profile，不把当前实测值错误当成未来状态。

2. **Counterfactual Freeze / 未改变设备冻结**
   - `predictVufForDeviceState()` 从当前真实 Live-P/Q 模型开始。
   - 只有真正被 AI 改变的设备才切换到目标 Profile。
   - 未改变的 Heatpump / Wallbox / Battery 保持当前 Live P/Q。
   - 因此预测 `ΔVUF` 不会再混入“未改变设备从 Live 模型跳回 Profile 模型”的假变化。

3. **Battery Stabilization Confidence**
   - 电池稳定不再只看 Sample Count + ΔI。
   - HIGH Confidence 还必须满足稳定持续时间和电流斜率条件。
   - 内部固定：最少 3 s、ΔI ≤ 0.02 A、3 次稳定更新、稳定窗口 ≥1.0 s、|dI/dt| ≤0.02 A/s、最长 10 s。
   - 10 s 超时后标记 `LOW` Confidence，但仍使用最新 Live Measurement 计算当前 VUF，不让 AI 永久卡死。

### 回归测试

- 47/47 `.mjs` 测试通过。
- JavaScript 语法检查通过。
- `SimpleDashboard.vue`、`AgentCard.vue`、`VufCard.vue` 的 `<script setup>` 语法检查通过。
- 源码包没有 `client/node_modules`，因此没有执行完整 Vite production build。

### 建议硬件验证

- Heatpump 档位保持不变，只观察真实 L1 电流爬升：Current Card 和 Current-State VUF 应同步响应。
- 只改变 Heatpump 候选，确认 Wallbox/Battery P/Q 在预测中保持冻结。
- 开启 Battery，只有满足 Min Settle + Sample Count + Stable Duration + Slope 后才显示 HIGH Confidence。
- 10 s 内无法稳定时应显示 LOW Confidence，但控制器不能永久卡死。
