# Senergate v1.5.1 B – Battery Reference 1.40 A + Collapsible English UI

## 1. Änderung / 修改

**DE:** Diese Revision baut auf der Battery-Ramping-B-Version auf. Der interne Battery-Skalierungsreferenzwert wurde von `1.30 A` auf `1.40 A` geändert. `Site Limits` und `AI Control Thresholds` sind jetzt ein-/ausklappbar und beim Laden standardmäßig geschlossen. Die sichtbare Benutzeroberfläche enthält nur englische Texte.

**中文：** 本版本基于 Battery Ramping B 版继续修改。Battery 内部缩放/饱和参考值从 `1.30 A` 调整为 `1.40 A`。`Site Limits` 与 `AI Control Thresholds` 现在都可以展开/收起，并且页面加载时默认收起。用户界面可见文字只保留英文。

## 2. Battery reference max

```text
BATTERY_CONTROL_INTERNALS.referenceMaxA = 1.40 A
```

**DE:** Dieser Wert bleibt ein interner Kalibrier-/Skalierungswert und wird nicht als normaler Benutzerparameter angezeigt. Er wird sowohl für die live Building-Twin-Stromskalierung als auch für die dynamische Battery-P/Q-Skalierung verwendet.

**中文：** 该值仍然属于内部标定/缩放参数，不作为普通用户调参项显示。它同时用于实时 Building Twin 电流缩放和 Battery 动态 P/Q 缩放。

Bei `Battery predicted ON current = 1.04 A` ergibt sich jetzt:

```text
prototype ratio = 1.04 / 1.40 = 0.742857...
Building Twin current ≈ 40 A × 1.04 / 1.40 = 29.71 A
```

**中文：** 因为参考最大值变为 1.40 A，所以 Battery OFF→ON 预测时，默认 1.04 A 对应约 74.29% 的 Battery Full P/Q，Building Twin 电流等效约为 29.71 A。`Battery predicted ON current` 的用户输入区间仍保持 `0.10–1.30 A`，没有随 reference max 改变。

## 3. Collapsible panels / 可折叠窗口

页面加载时：

```text
Senergate Grid Impedance   -> collapsed
Site Limits                -> collapsed
AI Control Thresholds      -> collapsed
```

`Site Limits` 与 `AI Control Thresholds` 使用 `SHOW` / `HIDE` 按钮。折叠只改变显示，不会停用已经生效的参数。

**DE:** Das Einklappen ist ausschließlich eine UI-Funktion. Bereits aktive Site-Limits und AI-Schwellenwerte bleiben im Controller wirksam.

## 4. Visible UI language / 界面语言

**DE:** Alle sichtbaren Texte der betroffenen Frontend-Komponenten wurden auf Englisch vereinheitlicht. Die früheren chinesischen/deutschen Zusatztexte in `Startup Initialization`, `Grid Impedance`, `AI Control Thresholds` und `CurrentCard` wurden entfernt.

**中文：** 当前涉及的前端可见文字统一为英文；Startup、Grid Impedance、AI Thresholds、CurrentCard 中之前的中文/德文附加文字已移除。

## 5. Input validation / 输入验证

现有严格验证保持不变：

```text
Decimal separator: .
Maximum decimal places: 2
Invalid draft: not applied to active controller
```

`Battery predicted ON current`:

```text
Default: 1.04 A
Allowed range: 0.10–1.30 A
```

## 6. Regression / 回归验证

- Battery Ramping logic preserved.
- Battery live P/Q VUF path preserved.
- Hard site-limit override during Battery ramp preserved.
- Heatpump / Wallbox measured-current scaling preserved.
- VUF 10-second history fix preserved.
- Branch-A command/state guards preserved.

Automated Node/static regression tests: **39/39 PASS**.

完整 Vite production build 仍需要安装 `client/node_modules` 后在 Pi5/开发环境执行。
