# Senergate v1.5.1 AI CONTROL E
## Monotonic Downshift für Heatpump / Wallbox · Heatpump / Wallbox 自动只降不升

**Basis / 基线:** `Senergate_v1.5.1_AI_CONTROL_D_UI_LIVE_CAPACITY`

**Ziel / 目标:** Die automatische AI-Regelung darf Heatpump und Wallbox ausschließlich abregeln. Eine automatische Hochregelung oder Rückkehr auf eine frühere höhere Stufe ist verboten. / AI 自动控制对 Heatpump 和 Wallbox 只允许降档，不允许自动升档，也不允许在 VUF 恢复后自动恢复到之前的高档位。

---

## 1. Zentrales Invariant / 核心控制不变量

```text
AI_CONTROL_INVARIANT

Heatpump:
  automatic next level <= current executed level

Wallbox:
  automatic next level <= current executed level

Battery:
  OFF <-> ON remains allowed
```

中文：
- Heatpump：AI 只能保持当前档或降低 1 档，不能升档。
- Wallbox：AI 只能保持当前档或降低 1 档，不能升档。
- Battery：仍然允许 `OFF -> ON` 和 `ON -> OFF`。
- 手动控制不受此规则限制；关闭 AI 自动控制后，用户仍可手动升/降档。

Deutsch:
- Heatpump und Wallbox sind im automatischen Regelpfad **monoton nicht steigend**.
- Die Batterie bleibt ein bidirektionaler ON/OFF-Aktor.
- Manuelle Bedienung bleibt bidirektional, wenn die Automatik deaktiviert ist.

---

## 2. Heatpump Adjustability / 热泵可调范围

Neue Zuordnung / 新映射：

| Adjustability | AI-Untergrenze / AI最低档 | Bedeutung / 含义 |
|---:|---:|---|
| 1–20 | Level 1 | AI darf bis L1 abregeln / 可降到L1 |
| 21–40 | Level 2 | AI darf bis L2 abregeln / 可降到L2 |
| 41–60 | Level 3 | AI darf bis L3 abregeln / 可降到L3 |
| 61–80 | Level 4 | AI darf bis L4 abregeln / 可降到L4 |
| 81–90 | Level 5 | keine Abregelreserve bei aktuellem L5 / 当前L5时无降档空间 |
| 91–100 | LOCKED | AI darf Heatpump nicht verändern / AI完全不能调整Heatpump |

Beispiel / 示例：

```text
Heatpump current = L5
Heatpump Adjustability = 95

=> Heatpump LOCKED
=> AI darf NICHT L5 -> L4 ausführen
=> verbleibende Aktoren:
   Battery OFF/ON
   Wallbox DOWN, falls Wallbox-Adjustability dies erlaubt
```

---

## 3. Wallbox Adjustability / Wallbox 可调范围

Unverändert / 保持：

| Adjustability | AI-Untergrenze / AI最低档 |
|---:|---:|
| 1–30 | Level 1 |
| 31–90 | Level 2 |
| 91–100 | LOCKED |

Automatisch erlaubt / 自动允许：

```text
3 -> 2
2 -> 1   (nur wenn min Level 1)
```

Automatisch verboten / 自动禁止：

```text
1 -> 2
2 -> 3
```

Die bestehende Break-Before-Make-Logik der Relay-Umschaltung bleibt erhalten. / 原有继电器 Break-Before-Make 逻辑保持不变。

---

## 4. Candidate Generation / 候选动作生成

`getReductionCandidates()` erzeugt weiterhin nur zulässige Abregelungen. / 继续只生成合法降档。

`getCompensationCandidates()` darf jetzt **nur noch Battery OFF -> ON** erzeugen. Heatpump- oder Wallbox-Upgrades wurden entfernt.

```text
Vorher / 之前可能：
HP 0 -> 1
WB 1 -> 2
WB 2 -> 3
Battery OFF -> ON

Jetzt / 现在：
Battery OFF -> ON
```

Zusätzlich existiert `automaticCandidateRespectsMonotonicRule(current, candidate)` als zentraler Guard. / 新增中央约束函数，任何候选只要让 HP/WB 档位高于当前实际档位就被拒绝。

---

## 5. Zweite Sicherheitsbarriere vor emit() / 下发命令前第二道保护

Neben dem Candidate-Filter wird direkt vor `emit('apply-state', patch)` erneut geprüft:

```text
candidate.heatpump <= current.heatpump
candidate.wallbox <= current.wallbox
```

Bei Verletzung:

```text
agentState = BLOCKED
command is NOT emitted
log: Automatic upshift blocked
```

中文：即使未来有人新增候选逻辑时忘记遵守“只能降档”，最终下发前仍会再次阻止自动升档。

---

## 6. Battery Priority / 电池优先策略

Battery-Priority bleibt bestehen. / 电池优先策略保持。

```text
Regelbedarf erkannt
       ↓
Battery OFF + safe/effective?
       ↓ YES
Battery ON
       ↓
confirm + settle + remeasure
       ↓
still unresolved?
       ↓
Heatpump / Wallbox DOWN candidates only
```

Battery darf auch ausgeschaltet werden, wenn Capacity/Headroom-Schutz dies erfordert oder wenn die prädizierte Regelwirkung dies sinnvoll macht. / Capacity/Headroom 保护需要时，电池仍可以关闭。

---

## 7. VUF / CUF / Schieflast / 触发条件

Diese Revision ändert **nicht** den aktiven Trigger-KPI. / 本版本不修改主动控制触发指标。

```text
Aktiv / 当前主动控制：VUF
Noch nicht aktiv / 暂不主动控制：CUF, Schieflast
```

`VUF > 2%` in der Diskussion war nur ein Beispiel. Die bestehenden konfigurierbaren VUF-Enter/Exit-Werte bleiben unverändert. / 讨论中的 `VUF > 2%` 只是示例，当前已有 VUF Enter/Exit 配置保持不变。

---

## 8. Verhalten nach erfolgreicher Abregelung / 调节成功后

Beispiel:

```text
HP L5 -> L4
VUF verbessert sich und verlässt den Regelbereich
```

Ergebnis:

```text
HP bleibt L4
```

Nicht erlaubt:

```text
AI: L4 -> L5 automatic restore
```

中文：系统恢复正常后保持当前降档状态，是否恢复高档由用户或未来独立的上层业务调度决定，而不是当前 VUF AI 自动恢复。

---

## 9. UI / 用户界面

Der bestehende Stil bleibt unverändert. Nur die Erklärung unter den Adjustability-Feldern wurde präzisiert:

```text
Heatpump Adjustability
AI downshift floor: Level X · no auto-upshift

Wallbox Adjustability
AI downshift floor: Level X · no auto-upshift
```

Keine neue Karte und keine Layout-Änderung. / 不新增 Card，不改变现有布局风格。

---

## 10. Geänderte Dateien / 修改文件

```text
client/src/ControlPolicyConfig.js
client/src/CapacitySupervisor.js
client/src/components/AgentCard.vue
client/src/components/SimpleDashboard.vue

tests/agent_candidate_strategy_static_test.mjs
tests/capacity_supervisor_behavior_test.mjs
tests/capacity_adjustability_static_test.mjs
tests/monotonic_downshift_invariant_test.mjs
```

---

## 11. Regression / 回归验证

Automatische Tests dieser Revision:

```text
38 PASS
0 FAIL
```

Zusätzliche Syntaxprüfung:

```text
ControlPolicyConfig.js    PASS
CapacitySupervisor.js     PASS
AgentCard.vue <script>    PASS
SimpleDashboard.vue       PASS
VufCard.vue               PASS
```

Die Tests bestätigen insbesondere:
- Heatpump `91..100 => LOCKED`.
- Wallbox `91..100 => LOCKED`.
- keine Heatpump-/Wallbox-Up-Candidates im AI-Pfad.
- Battery `OFF -> ON` bleibt verfügbar.
- finaler Monotonic-Guard vor Befehlsausgabe vorhanden.
- bestehende Capacity/VUF/Branch-A/B-Regressionen bleiben grün.

---

## 12. Empfohlene Hardware-Prüfung / 建议真机测试

1. Heatpump L5, Adjustability 95, AI-Regelbedarf erzeugen -> **kein L5->L4**.
2. Gleicher Zustand, Wallbox L3, WB Adjustability 50 -> Battery bzw. **WB L3->L2** darf gewählt werden.
3. HP/WB beide >90 -> nur Battery darf automatisch ON/OFF schalten.
4. HP L5, Adjustability 50 -> L5->L4->L3 möglich, **L3->L4 verboten**.
5. WB L3, Adjustability 30 -> L3->L2->L1 möglich, **L1->L2 verboten**.
6. Nach VUF-Erholung prüfen, dass keine automatische Wiederanhebung erfolgt.
