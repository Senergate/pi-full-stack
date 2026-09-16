# Senergate v1.5.1 – Variante A Real-Current Live Display / A版真实电流同步显示说明

**Basis / 基线:** `v1.5.1 AI CONTROL A – CURRENT BEHAVIOR`  
**Neue Build-ID / 新 Build ID:** `v1.5.1-ai-a-real-current-live-twin`

## 1. Ziel / 目标

**DE:** Die AI-Regelstrategie und die bestehende P/Q→VUF-Berechnung der Variante A bleiben unverändert. Geändert wird ausschließlich die Anzeige des **BUILDING TWIN · MODELED** Phasenstroms: Sie verwendet nun die real gemessenen Prototyp-Stromkennlinien als Skalierungsanker und folgt jeder Änderung des live gemessenen Shelly-Stroms synchron.

**中文：** A版 AI 控制策略以及原有 P/Q→VUF 计算保持不变。本次只修改 **BUILDING TWIN · MODELED** 模拟电流显示：使用已经获得的真实 Prototype 电流曲线作为缩放基准，并且在 Shelly 实测电流变化时同步更新模拟电流。

## 2. Real gemessene Referenzkurven / 真实实测参考曲线

| Branch | Zustand / 状态 | Prototype Strom / 实测电流 | Building-Twin-Max | Kennlinienwert / 对应模拟值 |
|---|---:|---:|---:|---:|
| Heatpump A | L1 | 0.09 A | 60 A | 20.77 A |
| Heatpump A | L2 | 0.16 A | 60 A | 36.92 A |
| Heatpump A | L3 | 0.21 A | 60 A | 48.46 A |
| Heatpump A | L4 | 0.24 A | 60 A | 55.38 A |
| Heatpump A | L5 | 0.26 A | 60 A | 60.00 A |
| Wallbox B | Mask 1 | 0.14 A | 64 A | 21.33 A |
| Wallbox B | Mask 2 | 0.30 A | 64 A | 45.71 A |
| Wallbox B | Mask 3 | 0.42 A | 64 A | 64.00 A |
| Battery C | Referenzmaximum / 预测最大值 | 1.30 A | 40 A | 40.00 A |

Messfehler der A/B-Prototypkurven / A/B 原型曲线测量误差: **±0.01 A**.

## 3. Live-Skalierung / 实时缩放

Für einen aktiven Zweig gilt / 对激活支路：

```text
I_twin = I_building_max × min(1, I_shelly_live / I_prototype_reference_max)
```

Damit / 因此：

- Heatpump: `I_ref,max = 0.26 A`, `I_building,max = 60 A`
- Wallbox: `I_ref,max = 0.42 A`, `I_building,max = 64 A`
- Battery: `I_ref,max = 1.30 A`, `I_building,max = 40 A`

**DE:** Jede neue Shelly-Messung ändert den angezeigten Twin-Strom ohne zusätzliche Verzögerung im Vue-Reaktivitätszyklus.  
**中文：** 每次 Shelly 新测量值进入 Vue reactive state 后，模拟电流会在同一响应式更新周期同步变化。

## 4. Battery-Sättigung / 电池上限处理

Explizite Anforderung / 明确要求：

```text
I_battery_measured > 1.30 A
→ I_battery_twin = 40 A
```

Beispiele / 示例：

| Battery Shelly | Twin |
|---:|---:|
| 0.01 A | 0.31 A |
| 0.65 A | 20.00 A |
| 1.04 A | 32.00 A |
| 1.30 A | 40.00 A |
| 1.50 A | 40.00 A |

**DE:** Damit kann die unsichere erste Batteriekennlinie den bereits definierten Building-Twin-Maximalstrom nicht überschreiten.  
**中文：** 这样即使真实电池电流高于当前第一版预测曲线，也不会让楼宇模拟值超过原来设定的 40 A 最大值。

## 5. OFF- und Fallback-Verhalten / OFF 与回退逻辑

- Gerät OFF / 设备关闭 → Twin-Strom = `0 A`, selbst wenn Messrauschen vorhanden ist / 即使存在测量噪声也为 0。
- Gerät ON + Shelly-Wert vorhanden → live gemessener Strom wird verwendet / 有实时值时使用实时值。
- Gerät ON + Shelly-Wert kurzfristig nicht verfügbar → Heatpump/Wallbox verwenden den bekannten Kurvenpunkt; Battery verwendet 1.30 A als vorläufiges Maximal-Fallback / 临时无实测数据时按已知曲线点回退，电池按 1.30 A 最大参考回退。

## 6. Was bewusst NICHT geändert wurde / 明确没有修改的部分

**DE:** Die Variante A bleibt die Vergleichsvariante mit bisherigem AI-Verhalten. Daher wurden nicht geändert:

- Kandidatensuche in `AgentCard.vue`
- Battery-Priority-Strategie
- P/Q Electrical Profile Model
- Feeder-/VUF-Berechnung
- Pending-/Settling-Verhalten der A-Variante
- Branch-A Embedded Safety/Drivecom-Vertrag

**中文：** A版仍作为“原控制策略对照版”，因此没有修改 AI 候选搜索、Battery Priority、P/Q 模型、VUF 算法、A版原 Pending/Settling 逻辑以及 Branch A Embedded Safety/Drivecom 合同。

这意味着：**CurrentCard 的模拟电流会实时跟着 Shelly 变化，但 VUF/AI 仍按 A版原来的 P/Q 状态模型运行。**

## 7. Geänderte/Neue Dateien / 修改与新增文件

- `client/src/PrototypeCurrentTwinModel.js` — neue reine Live-Skalierungslogik / 新增实时电流缩放模型
- `client/src/components/SimpleDashboard.vue` — CurrentCard-Twinstrom改用 live-scaled model
- `client/src/ControlPolicyConfig.js` — 更新真实电流曲线用途说明
- `tests/prototype_current_live_twin_test.mjs`
- `tests/prototype_current_live_twin_static_test.mjs`
- `tests/frontend_build_version_static_test.mjs`

## 8. Tests / 测试

```text
33 / 33 .mjs tests PASS
```

Zusätzlich geprüft / 额外验证：

- Heatpump curve anchor scaling
- Wallbox curve anchor scaling
- Live increase/decrease synchronization
- Battery 1.30-A saturation
- Battery 0.01-A near-full mapping
- OFF-state noise suppression

**Hinweis / 注意:** Ein vollständiger Vite-Build konnte im gelieferten ZIP-Artefakt nicht ausgeführt werden, weil `node_modules`/`vite` nicht enthalten sind. Die vorhandenen Node-Regressions- und Syntaxpfade wurden jedoch erfolgreich ausgeführt.
