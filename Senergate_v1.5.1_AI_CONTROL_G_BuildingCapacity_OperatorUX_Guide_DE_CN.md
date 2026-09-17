# Senergate v1.5.1 AI CONTROL G
## Building-Twin Capacity + Operator Adjustability UX
## Building-Twin 容量计算 + 用户可调范围交互优化

Stand / 状态: 2026-09-17

---

## 1. Ziel / 目标

**DE:** Diese Version baut auf AI CONTROL F auf. Capacity/Headroom wird im Prototype nicht mehr aus den kleinen realen Prototype-Strömen abgeleitet, sondern aus den hochskalierten **Building-Twin MODELED** Werten. Die realen Shelly-Werte bleiben parallel als **Prototype MEASURED** sichtbar.

**中文：** 本版本基于 AI CONTROL F。Prototype 中的 Capacity/Headroom 不再使用很小的真实 Prototype 电流计算，而是使用放大后的 **Building Twin MODELED** 值。Shelly 真实值仍作为 **Prototype MEASURED** 独立显示。

---

## 2. Capacity-Berechnung / Capacity 计算

**DE:** Für konfigurierte Gebäudelimits gilt:

```text
Usage = max(
  P_model / P_max,
  I_L1_model / I_L1_max,
  I_L2_model / I_L2_max,
  I_L3_model / I_L3_max
)
```

**中文：** 配置的建筑容量上限与模拟值比较：

```text
Usage = max(
  P模拟 / P上限,
  L1模拟电流 / L1上限,
  L2模拟电流 / L2上限,
  L3模拟电流 / L3上限
)
```

Beispiel / 例子：

```text
Prototype MEASURED L1 = 0.26 A
Building Twin MODELED L1 = 10.00 A
Building max L1 current = 10.00 A

=> L1 Capacity Usage = 100%
```

Der Prototype-Messwert 0.26 A ist weiterhin sichtbar, bestimmt aber nicht die Building-Capacity-Auslastung. / 0.26 A 实测值仍显示，但不决定 Building Capacity Usage。

---

## 3. Capacity-Tabelle / Capacity 表格

Die Tabelle zeigt jetzt fünf Spalten / 现在显示五列：

```text
Metric
Prototype · MEASURED
Building Twin · MODELED
100% Limit
Usage
```

Bei `0 = OFF` bleibt `Usage = --`; es wird niemals fälschlich `0.0%` angezeigt. / 当上限配置为 `0=OFF` 时，Usage 显示 `--`，不会错误显示为 `0.0%`。

---

## 4. Building Limits / 建筑容量上限

Die UI-Beschriftung wurde präzisiert / UI 标签改为：

```text
Building max total power [W] · 0=OFF
Building max L1 current [A] · 0=OFF
Building max L2 current [A] · 0=OFF
Building max L3 current [A] · 0=OFF
```

Die internen Policy-Keys bleiben aus Kompatibilitätsgründen `siteMax...`. / 为兼容旧配置，内部键名仍保持 `siteMax...`。

---

## 5. Operator Adjustability als Accordion / 用户可调范围独立折叠

**DE:** Der Bereich ist unabhängig ein-/ausklappbar und speichert seinen Zustand in `localStorage`.

**中文：** Operator Adjustability 现在是独立可折叠区域，并记忆用户上次展开/收起状态。

```text
senergate.operatorAdjustabilityExpanded
```

Eingeklappt / 收起：

```text
Operator Adjustability
HP 50 → Level 3 · WB 50 → Level 2 · AI downshift only
```

---

## 6. Heatpump-Mapping / Heatpump 数值映射

```text
1–20   -> Min Level 1
21–40  -> Min Level 2
41–60  -> Min Level 3
61–80  -> Min Level 4
81–90  -> Min Level 5
91–100 -> AI LOCKED
```

Automatisches Hochschalten bleibt verboten. / AI 仍禁止自动升档。

---

## 7. Wallbox-Mapping / Wallbox 数值映射

```text
1–30   -> Min Level 1
31–90  -> Min Level 2
91–100 -> AI LOCKED
```

Automatisches Hochschalten bleibt verboten. / AI 仍禁止自动升档。

---

## 8. Preview + Commit / 预览与正式生效

**DE:** Während der Eingabe wird nur die Zuordnungsvorschau aktualisiert. Erst bei `Enter` oder beim Verlassen des Feldes wird der Wert validiert und aktiv übernommen.

**中文：** 用户输入过程中只更新映射预览。按 `Enter` 或输入框失焦后才校验并正式写入控制参数。

Ungültige Werte außerhalb 1–100 bzw. Nicht-Ganzzahlen werden verworfen; der vorherige aktive Wert bleibt bestehen. / 非 1–100 整数会被拒绝，继续使用上一组有效值。

---

## 9. Größere Accordion-Pfeile / 更大的折叠箭头

Grid Impedance, Capacity, Operator Adjustability und Advanced Control verwenden einen größeren Pfeil und eine größere Klickfläche. / Grid Impedance、Capacity、Operator Adjustability、Advanced Control 的箭头和点击区域都放大。

---

## 10. Unveränderte Regel-Invarianten / 未改变的控制不变量

```text
Heatpump AI: downshift only
Wallbox AI: downshift only
Battery: OFF <-> ON
One-step control
Adjustability limits cannot be crossed
Pending -> confirmed -> settling
Voltage guard remains mandatory
CUF/Schieflast not active control triggers in this version
```

---

## 11. Wichtige Trennung / 重要边界

**DE:** Building Capacity ist ein MODELED Digital-Twin-KPI. Reale Prototype-Schutzfunktionen müssen weiterhin auf realer Hardware, Schutzorganen und realen Messwerten beruhen.

**中文：** Building Capacity 是 MODELED Digital Twin KPI。Prototype 的真实硬件安全仍必须依赖真实测量、保险/MCB/接触器等硬件保护，不能被模拟值替代。

---

## 12. Empfohlene Pi5-Prüfung / Pi5 建议验证

1. L1 Building limit auf 10 A setzen. / 设置 L1 Building max = 10 A。
2. Einen Zustand herstellen, dessen MODELED L1 ungefähr 10 A erreicht. / 让 MODELED L1 接近 10 A。
3. Prüfen: Capacity Usage muss ca. 100% anzeigen, auch wenn Prototype MEASURED viel kleiner ist. / 检查 Capacity ≈100%，即使真实电流很小。
4. Alle Limits auf 0 setzen: `Usage` muss `--` anzeigen. / 全部上限=0时 Usage 必须显示 `--`。
5. Operator Adjustability anklicken und Mapping-Hinweise prüfen. / 点击用户可调参数并检查映射提示。
6. Ungültigen Wert 101 eingeben: aktiver Wert darf sich nicht ändern. / 输入101，实际生效参数不能改变。
7. Accordion-Zustände nach Browser-Reload prüfen. / 刷新浏览器后检查折叠状态是否保持。
