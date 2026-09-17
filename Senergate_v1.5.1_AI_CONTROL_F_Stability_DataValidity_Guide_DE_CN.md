# Senergate v1.5.1 · AI CONTROL F
## Stability / Data-Validity Debug · DE/CN

**Basis / 基线:** `AI CONTROL E — MONOTONIC DOWNSHIFT`

Diese Revision ist bewusst eine Stabilitäts- und Datenvaliditätsrevision. Die bestehende Regelstrategie wird nicht neu erfunden. / 本版本专门用于稳定性和数据有效性修复，不重新设计现有控制策略。

## 1. Unveränderte Regel-Invarianten / 不变的控制原则

- **DE:** Heatpump und Wallbox dürfen automatisch nur heruntergeregelt werden; automatisches Hochregeln bleibt verboten.  
  **中文：** Heatpump 和 Wallbox 的 AI 自动控制只能降档，不能升档。
- **DE:** Battery bleibt `OFF ↔ ON` bidirektional.  
  **中文：** Battery 保持双向 `OFF ↔ ON`。
- **DE:** Operator-Adjustability darf nicht überschritten werden.  
  **中文：** 不得突破用户设置的 Adjustability 下限。
- **DE:** Pro Regelzyklus genau eine Aktion, danach Ausführungsbestätigung und Settling.  
  **中文：** 每个控制周期只执行一个动作，确认执行后进入 Settling。
- **DE:** Capacity-/Voltage-Hard-Guards haben Vorrang vor VUF-Optimierung.  
  **中文：** Capacity / Voltage 的硬约束优先于 VUF 优化。
- **DE:** CUF/Schieflast bleibt in dieser Revision reine Anzeige-/Analysegröße und ist kein aktiver Trigger.  
  **中文：** 本版本 CUF/Schieflast 仍不进入主动控制触发逻辑。

## 2. F1 — Raw VUF vs. Anzeige / 原始 VUF 与显示值分离

Vorher konnte z. B. `2.04 %` auf `2.0 %` gerundet und dadurch als `WARNING` klassifiziert werden, während der Regler bereits auf dem Rohwert reagierte. / 以前 `2.04%` 可能显示成 `2.0% WARNING`，但 AI 已按原始值启动控制。

Neu gilt strikt:

```text
Raw VUF -> Status / Control classification
Rounded VUF -> Anzeige only
```

Beispiel / 示例:

```text
raw = 2.04 %
display = 2.0 %
status = CRITICAL
```

## 3. F2 — VUF-History mit Data Gap / VUF 曲线数据空洞

Die 10-s-Kurve unterscheidet nun zwischen konstantem gültigem Wert und ungültigen Daten. / 10 秒曲线现在区分“恒定有效值”和“数据失效”。

- Konstanter gültiger Wert / 恒定有效值:

```text
1.8%  ───────────────────── now
```

- Datenverlust / 数据失效:

```text
1.8%  ────────     [gap]
```

Der letzte alte Wert wird bei ungültigem VUF **nicht** bis `now` verlängert. / VUF 失效后旧值不会继续伪装成实时曲线。

## 4. F3 — Capacity LIVE / STALE / LAST KNOWN

Capacity erhält `dataFresh`. Bei veralteten Shelly-Daten gilt:

```text
Capacity Usage = --
Headroom       = --
State          = STALE DATA
```

Die letzten Messwerte bleiben sichtbar, aber klar als `LAST KNOWN` markiert. / 最后一次测量值仍显示，但明确标记为 `LAST KNOWN`。

Ein wichtiger Nebenfix: `null` wird nicht mehr durch `Number(null)` irrtümlich als `0` angezeigt. / 同时修复 `null` 被错误转成 `0` 的数据显示问题。

## 5. F4 — Total Power vollständig oder UNKNOWN / 总功率必须三相完整

`Total Power` wird nur berechnet, wenn L1/L2/L3 Active Power vollständig vorhanden sind. / 只有 L1/L2/L3 三相有功功率都有效时才计算 Total Power。

```text
L1 valid + L2 valid + L3 missing
=> Total Power = --
```

Damit wird eine Teil-Summe nicht als reale Gesamtleistung ausgegeben. / 防止把缺相后的部分和误显示成总功率。

## 6. F5 — Battery Effectiveness dreistufig / 电池有效性三态

Der alte Fallback `Battery current = gesamte L3 current` wurde entfernt. / 删除了“没有 baseline 时用整个 L3 电流当作 Battery 电流”的错误 fallback。

```text
Battery OFF              -> N/A
Battery ON + baseline    -> ΔI = I_L3_live - I_L3_baseline
ΔI >= threshold          -> EFFECTIVE
ΔI < threshold           -> INEFFECTIVE
Battery ON no baseline   -> UNKNOWN
```

Default:

```text
Battery Effective Threshold = 0.10 A
```

`UNKNOWN` wird nicht als `INEFFECTIVE` interpretiert und löst daher nicht fälschlich sofort zusätzliche HP/WB-Abregelung aus. / UNKNOWN 不会被误判成 INEFFECTIVE。

## 7. F6 — Threshold Validation / 阈值顺序校验

Gültige Beziehung:

```text
VUF Exit < VUF Enter
Warning < Pre-Limit < Critical < Hard = 100%
```

Ungültige Eingaben werden verworfen; die letzte gültige Konfiguration bleibt aktiv. Es findet **keine automatische Sortierung** statt. / 非法输入会被拒绝，并保留上一组合法参数；程序不会偷偷自动排序。

## 8. F7 — Measured-Shape Fallback Profiles / 实测形状 fallback

Wenn keine echte P+jQ-Kalibrierung vorliegt, verwendet das Building Twin nun die gemessene Stromkurvenform. / 无真实 P+jQ calibration 时，Building Twin 使用目前实测电流曲线的归一化形状。

Heatpump measured / 实测:

```text
L1 0.09 A -> 0.346
L2 0.16 A -> 0.615
L3 0.21 A -> 0.808
L4 0.24 A -> 0.923
L5 0.26 A -> 1.000
```

Wallbox measured / 实测:

```text
Level 1 0.14 A -> 0.333
Level 2 0.30 A -> 0.714
Level 3 0.42 A -> 1.000
```

Echte kalibrierte P+jQ-Punkte überschreiben weiterhin die Fallback-Werte. / 真正 calibration 后的 P+jQ 数据仍然拥有最高优先级。

## 9. F8 — Signed ΔVUF / 带符号 ΔVUF

Scenario ΔVUF wird nicht mehr mit `max(0, delta)` abgeschnitten. / Scenario ΔVUF 不再把负值强制变成 0。

```text
+0.3% = scenario worsens VUF
-0.4% = scenario improves VUF
```

## 10. F9 — Voltage Guard dreistufig / Voltage Guard 三态

UI:

```text
SAFE
VIOLATED
UNKNOWN
```

`UNKNOWN` wird nicht mehr als `VIOLATED` ausgegeben. Für automatische Kandidaten bleibt die Regel streng: ein Rich-Prediction-Candidate muss `voltageSafe === true` liefern. / UI 不再把无数据误报成 VIOLATED；自动候选仍必须明确 `voltageSafe === true` 才能执行。

## 11. F10 — CRITICAL_UNRESOLVED / 无法解决状态

Vor `CRITICAL_UNRESOLVED` wird jetzt auch die jeweils andere Battery-Stellung geprüft. / 进入 `CRITICAL_UNRESOLVED` 前，现在会同时检查 Battery 的另一种状态。

```text
Battery OFF -> test ON
Battery ON  -> test OFF
```

Nur wenn HP/WB ihre erlaubte Untergrenze erreicht haben **und** keine zulässige Battery-Umschaltung den kritischen Zustand verlassen kann, wird `CRITICAL_UNRESOLVED` gesetzt. / 只有 HP/WB 到达允许下限且 Battery 开关两种方向都无法解除严重状态时，才进入 unresolved。

## 12. Konfliktprüfung / 冲突检查

Die Debug-Reihenfolge wurde bewusst getrennt getestet:

```text
Raw VUF semantics
 -> VUF history gaps
 -> Capacity freshness
 -> Battery tri-state
 -> Threshold validation
 -> measured-shape fallback
 -> signed delta / voltage UI
 -> full regression
```

Die Monotonic-Downshift-, Adjustability-, Battery-Priority-, Pending-/Settling- und Voltage-Guard-Invarianten bleiben erhalten. / 逐项修复后重新验证了只能降档、Adjustability、Battery Priority、Pending/Settling、Voltage Guard 等原有不变量。

## 13. Tests / 测试

```text
Automated Node regression tests: 42 PASS / 0 FAIL
JS syntax: PASS
Vue <script setup> syntax: PASS
```

Zusätzlich verifiziert / 额外验证:

```text
Weak-Grid Demo WB-only VUF = 2.620%
Voltage guard remains SAFE in the regression scenario
All-max compensated VUF = 0.290%
```

Ein vollständiger Vite Production Build konnte in der isolierten Umgebung nicht ausgeführt werden, weil `xmlhttprequest-ssl-2.1.2.tgz` nicht im lokalen npm-Cache vorhanden ist. Das ist kein Source-Testfehler. / 当前隔离环境的 npm cache 缺少该依赖，因此未完成完整 Vite production build；这不是源码测试失败。

## 14. Pi5 Bench Checks / Pi5 真机验证建议

1. VUF 维持常数超过 15 秒，曲线应保持水平线。 / Konstanter VUF >15 s bleibt sichtbar.  
2. Shelly 数据断开 >3 s，Capacity 应显示 `STALE DATA`，Usage/Headroom 变 `--`，最后数据标记 `LAST KNOWN`。  
3. Battery ON 但没有 baseline 时显示 `UNKNOWN`，不得使用 L3 总电流作为 Battery ΔI。  
4. 输入非法阈值，例如 Warning 95%、Pre-Limit 90%，应被拒绝并恢复上一组合法值。  
5. HP/WB 自动控制仍只能降档。  
6. `CRITICAL_UNRESOLVED` 前确认 Battery OFF/ON 另一状态也无法解除。  
7. Scenario ΔVUF 改善时应显示负值，例如 `-0.4%`。  
8. VUF/电压模型无数据时 Voltage Guard 显示 `UNKNOWN`，而不是 `VIOLATED`。
