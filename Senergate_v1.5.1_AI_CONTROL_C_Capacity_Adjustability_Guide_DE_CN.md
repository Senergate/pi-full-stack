# Senergate v1.5.1 AI CONTROL C
## Capacity Supervisor + Heatpump/Wallbox Adjustability
### Deutsch / 中文

## 1. Basis / 基准

**DE:** Diese Variante basiert auf der v1.5.1-Bugfix-Linie und auf der vorherigen Battery-Priority-Variante. Branch-A-Firmware, DriveCom/Modbus-Safety und die bestehende P/Q-VUF-Modellierung werden nicht ersetzt.

**中文：** 本版本基于 v1.5.1 Bugfix 以及之前的 Battery-Priority 版本。Branch A 固件、DriveCom/Modbus Safety 和现有 P/Q→VUF 建模路径不被替换。

Build-ID:

```text
v1.5.1-ai-c-capacity-adjustability
```

---

## 2. Neue Module / 新增模块

Neu:

```text
client/src/CapacitySupervisor.js
```

Dieses Modul enthält zentral:

- Capacity-Usage-Berechnung / 容量利用率计算
- L1/L2/L3-Limit-Auflösung / 各相上限解析
- Heatpump-Adjustability-Mapping / Heatpump 可调节映射
- Wallbox-Adjustability-Mapping / Wallbox 可调节映射
- NORMAL/WARNING/PRE-LIMIT/CRITICAL/HARD-Zustand / 容量状态机

Damit benutzen Dashboard und AI dieselben Regeln.

---

## 3. Capacity Usage / 容量利用率

### Formel / 公式

```text
CapacityUsage = max(
  Ptotal / Pmax,
  IL1 / IL1max,
  IL2 / IL2max,
  IL3 / IL3max
)
```

```text
RemainingHeadroom = max(0, 1 - CapacityUsage)
```

**DE:** 100 % bedeutet den jeweils konfigurierten projektspezifischen Hard Limit. Es ist kein universeller gesetzlicher Zahlenwert.

**中文：** 100% 表示项目中配置的真实硬上限，不是一个适用于所有建筑的统一法规数字。

Konfigurationsparameter / 配置参数:

```text
siteMaxTotalPowerW
siteMaxCurrentL1A
siteMaxCurrentL2A
siteMaxCurrentL3A
```

Default:

```text
0 = disabled
```

Damit bleibt die bestehende Laufzeit ohne eingetragene Standortgrenzen unbeeinflusst.

---

## 4. Capacity-Zustände / Capacity 状态

Default Engineering Thresholds:

```text
< 80%       NORMAL
80–<90%     WARNING
90–<95%     PRE-LIMIT
95–<100%    CRITICAL
>=100%      HARD LIMIT
```

Parameter:

```text
warningRatio  = 0.80
preLimitRatio = 0.90
criticalRatio = 0.95
hardRatio     = 1.00
```

**DE:** 80/90/95 % sind Senergate Engineering Margins. 100 % verweist auf den konfigurierten Projekt-Hard-Limit.

**中文：** 80/90/95% 是 Senergate 工程提前控制阈值；100% 对应实际项目配置的硬边界。

---

## 5. Anzeige / 显示

Der neue Bereich ist **standardmäßig eingeklappt**, damit die vorhandene Dashboard-Anordnung nicht unnötig verändert wird.

收起时：

```text
Capacity 73% · Headroom 27% · Limit: L2 Current · NORMAL ▼
```

展开后显示：

```text
Capacity Usage
Remaining Headroom
Limiting Constraint
State

Total Power   actual / 100%-limit / usage
L1 Current    actual / 100%-limit / usage
L2 Current    actual / 100%-limit / usage
L3 Current    actual / 100%-limit / usage
```

Zusätzlich werden die Bezugsinformationen angezeigt:

```text
100% Capacity = configured site hard limit
80/90/95% = Senergate engineering thresholds
4.6 kVA ≈ 20 A = VDE symmetry reference, NOT phase total-capacity limit
Prototype ≤2 kW / <9 A = internal engineering reference
```

Der Auf-/Zu-Status wird lokal gespeichert:

```text
localStorage key:
senergate.capacityPanelExpanded
```

---

## 6. Heatpump Adjustability / Heatpump 调整阈值

Parameter:

```text
heatpumpAdjustability = 1 ... 100
```

Mapping:

| Wert / 值 | AI-Mindeststufe / AI最低档 |
|---:|---:|
| 1–20 | Level 1 |
| 21–40 | Level 2 |
| 41–60 | Level 3 |
| 61–80 | Level 4 |
| 81–99 | Level 5 |
| 100 | LOCKED |

**Wichtig / 重要：** Level 0 bleibt STOP/ZERO_HOLD-Semantik und wird durch normale VUF-/Capacity-Derating-Logik nicht automatisch gewählt.

Default:

```text
heatpumpAdjustability = 50
=> minimum Level 3
```

Dieser Default entspricht ungefähr der bisherigen effektiven 50%-Mindestlastlogik der vorherigen AI-Version.

---

## 7. Wallbox Adjustability / Wallbox 调整阈值

Parameter:

```text
wallboxAdjustability = 1 ... 100
```

Mapping:

| Wert / 值 | AI-Mindeststufe / AI最低档 |
|---:|---:|
| 1–30 | Level 1 |
| 31–90 | Level 2 |
| 91–100 | LOCKED |

Default:

```text
wallboxAdjustability = 30
=> minimum Level 1
```

**DE:** Der Default 30 ist absichtlich der permissivste Wert der neuen Nicht-Auto-OFF-Semantik. Für einen realen Komfortbetrieb kann z. B. `50` gewählt werden, wodurch Level 2 die Untergrenze wird.

**中文：** 默认 30 是新规则中最宽松的“不自动关到0档”设置。实际运行如果希望减少对充电的干预，可以配置 50，此时最低只降到 Level 2。

---

## 8. Wallbox Break-Before-Make / Wallbox 切换顺序

Bei einer logischen Umschaltung `Level 2 -> Level 1` ändert sich der Relay-Mask von 2 auf 1. Würde R0 zuerst eingeschaltet, könnte kurzzeitig Mask 3 entstehen.

因此代码改为：

```text
先 OFF 不需要的 Relay
再 ON 新需要的 Relay
```

Beispiel:

```text
mask2 (R0=OFF,R1=ON)
-> R1 OFF
-> R0 ON
-> mask1
```

Dies reduziert das Risiko eines kurzzeitigen Lastanstiegs während Capacity-Derating.

---

## 9. Battery Effective Threshold / 电池有效阈值

Default:

```text
batteryEffectiveMinA = 0.10 A
```

Wenn Battery ON ist und der gemessene inkrementelle Ladestrom unter dieser Schwelle liegt, wird die Batterie nicht mehr als wirksamer VUF-Aktor betrachtet.

这不是 Capacity 上限，而只是判断 Battery 是否仍有实际调节效果。

---

## 10. Capacity vs. Adjustability / Capacity 与设备可调范围

Priorität:

```text
Hard electrical constraints
        ↓
Capacity PRE-LIMIT / HARD handling
        ↓
Operator Adjustability
        ↓
VUF optimization / Battery priority
```

Ab PRE-LIMIT:

```text
Capacity >= 90%
    ↓
HP/WB innerhalb erlaubter范围降档
    ↓
如果都不能再降，并且 Battery ON
    ↓
Battery OFF / release charging load
```

Dadurch überschreibt Capacity nicht die Operator-Grenzen für HP/WB; stattdessen wird gegebenenfalls die zuvor zugeschaltete Batterielast wieder freigegeben.

---

## 11. CRITICAL_UNRESOLVED / 无法解除的 Critical

Der Zustand wird gesetzt, wenn:

```text
VUF > vufEnterPct
AND
Heatpump ist an seiner erlaubten Untergrenze / locked
AND
Wallbox ist an seiner erlaubten Untergrenze / locked
AND
Battery kann den Critical-Bereich nicht verlassen
```

Battery-Prüfung:

```text
Battery bereits ON + VUF weiterhin critical
=> keine weitere Battery-ON-Wirkung verfügbar

Battery OFF
=> Battery ON wird prognostiziert
=> nur wenn voltage-safe UND VUF <= enter threshold, kann Battery Critical lösen
```

Im Zustand:

```text
CRITICAL_UNRESOLVED
```

wird kein sinnloser Befehl im 250-ms-Takt wiederholt. Die Regelung hält und überwacht weiter.

Reevaluation erfolgt, wenn sich z. B. ändert:

- Device state
- Heatpump/Wallbox adjustability
- Battery effectiveness
- Capacity Usage
- VUF fällt unter die Release-Schwelle

---

## 12. VUF Red Blink / VUF 红色闪烁

Bei `CRITICAL_UNRESOLVED`:

```text
VUF = red
blink period = 1 second
minimum opacity = 0.25
```

Damit bleibt der Wert auch während des Blinkens lesbar.

Das Capacity Panel blinkt nicht; Capacity CRITICAL/HARD wird nur farblich markiert, damit das Dashboard nicht visuell unruhig wird.

---

## 13. Norm-/Referenztrennung / 法规与工程阈值区分

### 4.6 kVA / ~20 A

Nur als deutsche Symmetrie-/Schieflast-Referenz anzeigen.

```text
NOT = L1/L2/L3 total current hard limit
```

### Prototype 2 kW / <9 A

Interne Senergate-Engineering-Referenz.

```text
NOT = universal statutory limit
```

### Site Hard Limits

Für reale Projekte müssen `Pmax` und `Imax` aus der tatsächlichen Projektplanung stammen, z. B.:

```text
Hausanschluss
Hauptsicherung
Leitungsdimensionierung
Gerätegrenzen
vertragliche Anschlussleistung
lokale TAB / DSO-Vorgaben
```

---

## 14. Dateien geändert / 修改文件

```text
client/src/CapacitySupervisor.js                  NEW
client/src/ControlPolicyConfig.js                CHANGED
client/src/components/SimpleDashboard.vue        CHANGED
client/src/components/AgentCard.vue              CHANGED
client/src/components/VufCard.vue                CHANGED
```

Branch-A-ESP32-Firmware wurde nicht geändert.

---

## 15. Tests / 测试

Automated tests:

```text
35 PASS
0 FAIL
```

JavaScript syntax checks passed for:

```text
ControlPolicyConfig.js
CapacitySupervisor.js
SimpleDashboard.vue <script setup>
AgentCard.vue <script setup>
VufCard.vue <script setup>
```

**Nicht ausgeführt / 未执行：** vollständiger Vite-Production-Build, weil die npm-Abhängigkeiten in der Ausführungsumgebung nicht vollständig installiert werden konnten. Real-Hardware/HIL-Validierung ist weiterhin erforderlich.

---

## 16. Empfohlene erste Hardware-Prüfung / 推荐首次硬件验证

1. Alle Site Limits = 0 → bestehender Betrieb darf nicht durch Capacity blockiert werden.
2. Testweise `Pmax` setzen und Capacity Usage gegen Shelly-P messen.
3. L1/L2/L3 einzeln konfigurieren und `Limiting Constraint` prüfen.
4. 90% PRE-LIMIT simulieren.
5. Heatpump-Grenzwerte 20/21/40/41/60/61/80/81/99/100 prüfen.
6. Wallbox 30/31/90/91/100 prüfen.
7. Wallbox Level2→Level1 Relay-Reihenfolge prüfen.
8. Battery ON + PRE-LIMIT + HP/WB am Minimum → Battery Release prüfen.
9. VUF Critical + HP/WB am Minimum + Battery ohne Lösung → `CRITICAL_UNRESOLVED` + 1-s-Blinken prüfen.
10. Branch-A STOP / SAFE_MODE / FAULT unverändert verifizieren.
