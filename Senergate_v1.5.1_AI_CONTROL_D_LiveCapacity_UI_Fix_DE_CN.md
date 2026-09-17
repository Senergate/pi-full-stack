# Senergate v1.5.1 AI CONTROL D
## Live Capacity UI + VUF-History-Fix + einklappbare Parameter / 实时 Capacity UI + VUF 曲线修复 + 折叠参数

## 1. Basis / 基准

**DE:** Diese Version baut direkt auf `AI CONTROL C — Capacity Supervisor + Asset Adjustability` auf. Die bestehende Battery-Priority-, Capacity-, Adjustability-, `CRITICAL_UNRESOLVED`- und Wallbox-Break-Before-Make-Logik bleibt erhalten.

**中文：** 本版本直接基于 `AI CONTROL C — Capacity Supervisor + Asset Adjustability`。原有 Battery Priority、Capacity、Adjustability、`CRITICAL_UNRESOLVED` 以及 Wallbox Break-Before-Make 逻辑保持不变。

Build-ID:

```text
v1.5.1-ai-d-live-capacity-ui
```

## 2. VUF-Kurve nach 10 s / VUF 曲线 10 秒后消失修复

**Problem / 问题:** Vue fügt einen History-Punkt nur hinzu, wenn sich der VUF-Wert ändert. Bleibt der Wert länger als 10 s konstant, bleibt im gleitenden Fenster nur der letzte bekannte Punkt. Die alte Zeichenroutine verlangte mindestens zwei Punkte und zeichnete deshalb nichts mehr.

**Fix / 修复:** `VufCard.vue` zeichnet bereits ab einem gültigen Punkt und verlängert den letzten bekannten Wert bis `now`. Liegt der letzte Punkt vor dem sichtbaren 10-s-Fenster, beginnt die horizontale Linie am linken Rand des Plot-Bereichs.

Erwartung / 预期:

```text
VUF = 2.31 % konstant

2.31%  ─────────────────────────
       -10 s                 now
```

## 3. Grid Impedance separat einklappbar / Grid Impedance 独立折叠

Neue UI-Zustände:

```text
senergate.gridImpedanceExpanded
```

- erster Start / 首次加载: **expanded**, damit die bestehende Oberfläche optisch erhalten bleibt;
- danach / 之后: Benutzerzustand wird in `localStorage` gespeichert;
- Capacity, Operator Controls und Calibration bleiben unabhängig sichtbar.

## 4. Capacity Live-Messwerte immer sichtbar / Capacity 实时值始终显示

`CapacitySupervisor.js` liefert jetzt immer eine stabile Vierer-Liste:

```text
Total Power
L1 Current
L2 Current
L3 Current
```

Auch bei:

```text
siteMaxTotalPowerW = 0
siteMaxCurrentL1A  = 0
siteMaxCurrentL2A  = 0
siteMaxCurrentL3A  = 0
```

bleiben die Live-Werte sichtbar. `0` deaktiviert nur den entsprechenden Grenzwert, nicht die Messanzeige.

Beispiel / 示例:

```text
Metric       Actual    100% Limit       Usage
Total Power  0.84 kW   Not configured   --
L1 Current   0.26 A    Not configured   --
L2 Current   0.42 A    Not configured   --
L3 Current   1.04 A    Not configured   --
```

## 5. Teilkonfiguration unterstützt / 支持部分配置

Nicht mehr erforderlich:

```text
Pmax + L1max + L2max + L3max müssen alle gesetzt sein
```

Neu:

```text
Nur konfigurierte Limits mit gültigem Live-Wert
nehmen an Capacity Usage teil.
```

Beispiel:

```text
Pmax = 2000 W
L1/L2/L3 max = 0
Pactual = 840 W

Capacity Usage = 42 %
Limiting Constraint = Total Power
```

## 6. Capacity-Zustände / Capacity 状态

Zusätzlich zu NORMAL/WARNING/PRE-LIMIT/CRITICAL/HARD gibt es in der UI:

```text
LIMITS NOT CONFIGURED
WAITING DATA
```

`LIMITS NOT CONFIGURED` bedeutet nicht, dass Messdaten fehlen. Es bedeutet nur, dass keine Capacity-Hard-Limits hinterlegt sind.

## 7. Kompakte Capacity-Zeile / Capacity 摘要栏

Die eingeklappte Zeile zeigt jetzt zusätzlich Live-Werte:

```text
Capacity -- · Headroom -- · Limits: OFF ·
P 0.84 kW · L1 0.26 A · L2 0.42 A · L3 1.04 A
```

Bei konfigurierten Limits:

```text
Capacity 73.0% · Headroom 27.0% · Limits: ON ·
P ... · L1 ... · L2 ... · L3 ... · Limit: L2 Current
```

## 8. UI-Parameter vereinfacht / 参数显示简化

Direkt sichtbar / 直接显示:

```text
Heatpump Adjustability
Wallbox Adjustability
Capacity Live Summary
```

Standardmäßig eingeklappt / 默认折叠到 Advanced:

```text
Site max total power
Site max L1 current
Site max L2 current
Site max L3 current
Battery effective min
VUF enter
VUF exit
Warning ratio
Pre-limit ratio
Critical ratio
```

Hard ratio:

```text
100 % fixed
```

wird nur als Read-only-Information gezeigt und nicht als editierbares Eingabefeld.

## 9. Unabhängige Accordion-Zustände / 独立折叠状态

```text
senergate.gridImpedanceExpanded
senergate.capacityPanelExpanded
senergate.advancedControlExpanded
```

**DE:** Das Einklappen verändert niemals die gespeicherten Parameter und deaktiviert keine Regelung.

**中文：** 折叠只影响 UI 显示，不会修改参数，也不会关闭任何控制逻辑。

## 10. Unverändert / 保持不变

- Branch-A-Firmware / Modbus / DriveCom
- Battery Priority
- HP/WB Adjustability-Mapping
- Capacity PRE-LIMIT derating
- Battery release bei Capacity-Druck
- `CRITICAL_UNRESOLVED`
- VUF rot + 1-s-Blink bei unresolved critical
- Wallbox Break-Before-Make
- CUF/Schieflast weiterhin nicht im aktiven Regler

## 11. Tests / 测试

Automatische Tests:

```text
37 PASS / 0 FAIL
```

Zusätzliche D-Tests:

- Live-Metriken bleiben bei Limits=0 sichtbar.
- Teilkonfiguration berechnet Capacity Usage korrekt.
- 95-%-L2-Beispiel wird als CRITICAL erkannt.
- Grid-Impedance-Accordion vorhanden.
- Advanced-Control-Accordion vorhanden.
- VUF-Zeichenroutine akzeptiert einen einzelnen letzten Punkt.

JavaScript-Syntax:

```text
CapacitySupervisor.js    PASS
SimpleDashboard.vue      PASS (script setup)
VufCard.vue              PASS (script setup)
AgentCard.vue            PASS (script setup)
```

Nicht in dieser Umgebung ausgeführt:

```text
Full Vite production build
```

Grund: npm Offline-Cache enthält nicht alle im Lockfile benötigten Pakete. Real-Hardware-/Browser-Bench-Test bleibt erforderlich.

## 12. Empfohlener Bench-Test / 推荐真机验证

1. Alle Site Limits = 0 lassen.
2. Prüfen, dass P/L1/L2/L3 trotzdem live im Capacity-Bereich angezeigt werden.
3. Nur `Pmax = 2000 W` setzen; L1/L2/L3 = 0 lassen.
4. Prüfen, dass nur Total Power die Capacity Usage bestimmt.
5. Capacity wieder einklappen und kontrollieren, dass Live-Werte in der Summary weiterlaufen.
6. Grid Impedance ein-/ausklappen; Capacity und Operator Controls dürfen nicht verschwinden.
7. Advanced öffnen/schließen; AI-Verhalten darf dadurch nicht geändert werden.
8. VUF länger als 15 s konstant halten; Kurve muss als horizontale Linie sichtbar bleiben.
