# Senergate v1.5.1 · Variante B
## Battery Priority + Battery Ramping + Validated UI

**Basis / 基准：** `Senergate_pi-full-stack_REAL_HARDWARE_PQ_VUF_v1.5.1_BRANCH_AB_VUF23_RUNTIME_FIX_2026-09-12`  
**Strategie / 策略：** `battery_priority_v2_ramping`  
**Datum / 日期：** 2026-09-16

---

# 1. Ziel / 目标

**DE:** Diese Version erweitert die bisherige Battery-Priority-Variante so, dass ein Batteriestart nicht mehr als sofortiger Sprung auf den stationären ON-Arbeitspunkt behandelt wird. Vor dem Einschalten wird mit einem konfigurierbaren stationären Prognosewert gerechnet. Nach real bestätigtem Einschalten folgt der aktuelle Digital Twin dem live gemessenen Batteriestrom bzw. Batterie-P/Q während des Hochlaufs. Normale AI-Optimierung wartet bis zur Stabilisierung; harte Standortgrenzen bleiben jederzeit aktiv.

**中文：** 本版本在已有 Battery Priority 版本基础上增加“电池启动爬升”处理。电池关闭时，AI 使用可配置的稳态预测电流判断是否值得开启；电池真实开启确认后，当前 Digital Twin/VUF 不再使用预测值，而是跟随 Shelly 实测 Battery 电流/P/Q。正常 AI 优化在电池稳定前暂停，但 Site Hard Limit 始终有效。

---

# 2. 用户界面最终只保留 6 个可编辑参数 / Nur 6 sichtbare editierbare Parameter

## Site Limits

| Parameter | Default | Bedeutung / 含义 |
|---|---:|---|
| Maximum total power | `0.00 W` | `0 = disabled`; standort-/anschlussspezifisch / 0 表示关闭，实际值由现场接入条件决定 |
| Maximum phase current | `0.00 A` | `0 = disabled`; maximale erlaubte Phasenbelastung des konkreten Standorts / 现场相电流限制 |

## AI Control Thresholds

| Parameter | Default | Range | Bedeutung / 含义 |
|---|---:|---:|---|
| VUF Enter | `2.00 %` | `0.10–5.00 %` | AI-Regelung wird bei `raw VUF > Enter` aktiv / raw VUF 超过该值进入控制 |
| VUF Exit | `1.70 %` | `0.00–4.99 %` und `< Enter` | Hysterese-Freigabe / 退出控制阈值 |
| Battery predicted ON current | `1.04 A` | `0.10–1.30 A` | Prognosewert nur für `Battery OFF -> ON` / 电池尚未开启时的稳态预测电流 |
| Battery effective minimum | `0.10 A` | `0.00–1.30 A`, `<= predicted` | Nach Stabilisierung darunter gilt Battery als praktisch unwirksam / 稳定后低于此值认为电池调节能力不足 |

**Wichtig / 重要：** `Battery predicted ON current` 与 `Battery reference max` 不是同一个参数。Prediction 默认 `1.04 A`；内部 scaling/saturation reference 仍为 `1.30 A`。

---

# 3. Eingabevalidierung / 输入验证

**DE:** Alle sichtbaren Site-/AI-Parameter sowie manuelle Grid-Impedance-Eingaben verwenden eine strikte Validierung. Ungültige Entwürfe werden niemals in die aktive Reglerkonfiguration übernommen.

**中文：** 所有可见 Site/AI 参数以及手工输入的 Grid Impedance 都进行严格验证。错误输入只停留在输入框中，不会写入正在运行的控制器。

Regeln / 规则：

- Dezimaltrennzeichen / 小数点：`.`
- Nur Ziffern und `.` / 只允许数字和句号
- Maximal 2 Nachkommastellen / 最多两位小数
- Kein `,`, `e`, `+`, `-` oder Buchstaben / 不允许逗号、科学计数法、正负号和字母
- Bereichsprüfung / 检查取值区间
- Relationale Prüfung / 检查参数之间的逻辑关系：
  - `VUF Exit < VUF Enter`
  - `Battery effective minimum <= Battery predicted ON current`

Beispiele für englische Fehlermeldungen / 英文错误提示示例：

```text
Use "." as the decimal separator. Allowed range: 0.10–1.30 A.
Use no more than 2 decimal places. Allowed range: 0.10–1.30 A.
Enter a value in the range 0.10–1.30 A.
VUF Exit must be lower than VUF Enter.
Battery effective minimum must not exceed Battery predicted ON current.
```

**Apply-Prinzip / 生效原则：**

```text
Edit draft -> validate -> valid -> apply
                     -> invalid -> keep last valid active value
```

---

# 4. Grid Impedance Panel / 电网阻抗面板

**DE:** `Senergate Grid Impedance / Netzimpedanz / 电网阻抗` ist jetzt ein ein-/ausklappbarer Advanced-Bereich.

**中文：** `Senergate Grid Impedance / Netzimpedanz / 电网阻抗` 现在是可以展开/折叠的高级调参栏。

Verhalten / 行为：

- Standard: eingeklappt / 默认折叠
- `SHOW` -> öffnen / 展开
- `HIDE` -> einklappen / 收起
- Zustand wird in `localStorage` gespeichert / 折叠状态本地保存
- Einklappen deaktiviert die Impedanz **nicht** / 收起只影响显示，不停止模型计算
- Aktive R/X-Werte bleiben im VUF-Modell / 当前 R/X 值继续参与 VUF 模型

**Manual Input / 手工输入：** `0.00–1.00 Ω`, max. 2 Nachkommastellen.  
**Preset-Präzision / 预设精度：** 内置 preset 保留原工程精度（例如 demo `Xphase=0.091 Ω`），因此仅折叠/展开或重新选择 preset 不会改变原有 v1.5.1 模型。用户手工修改时才强制最多两位小数。

---

# 5. Battery OFF -> ON Prediction / 电池开启前预测

Wenn Battery aktuell OFF ist / 当 Battery 当前关闭：

```text
raw VUF > VUF Enter
       |
       v
Battery OFF
       |
       v
Prediction current = Battery predicted ON current
Default = 1.04 A
       |
       v
1.04 / 1.30 = 0.80 of Battery full P+jQ profile
       |
       v
Building-Twin prediction
       |
       v
Projected VUF + projected phase voltages
```

Mit aktuellem 40-A-Building-Maximum entspricht der Defaultstrom näherungsweise / 对当前 40A Building Max：

`40 A * 1.04 / 1.30 = 32 A Building-equivalent`.

Der Wert ist eine **Prediction**, keine aktuelle Messung. / 这个值只用于预测，不代表当前实测。

---

# 6. Nach bestätigtem Battery ON / 电池真实开启确认后

Sobald der reale Status `Battery ON` bestätigt ist / 电池 ON 状态得到真实反馈确认后：

```text
COMMAND_PENDING
      -> ON CONFIRMED
      -> BATTERY_RAMPING
```

Ab diesem Punkt wird `Battery predicted ON current` **nicht** als Istwert verwendet. / 从这里开始，1.04A 预测值不再当作当前实际状态。

Current-state model / 当前状态模型：

```text
Shelly live Battery current / P / apparent power
                    |
                    v
incremental Battery P+jQ
                    |
                    v
building-equivalent scaling (saturated at 1.30 A reference)
                    |
                    v
PhasorCalculator
                    |
                    v
live Estimated VUF
```

Wenn ein gültiges OFF-Baseline-P/Q-Profil vorhanden ist, bevorzugt die Software live inkrementelles Shelly-P/Q. Andernfalls fällt sie auf Current-Scaling des bestehenden Battery-P/Q-Profils zurück. / 有有效 OFF baseline 时优先使用实时增量 P/Q；否则使用实时电流对既有 Battery P/Q profile 进行比例缩放。

---

# 7. Battery-Ramping-Stabilisierung / 电池爬升稳定判断

Interne, nicht sichtbare Konstanten / 内部固定参数：

```text
Battery min settle      = 3 s
Battery stable delta    = 0.02 A
Battery stable samples  = 3 fresh Shelly updates
Battery max settle      = 10 s
```

Die Stabilitätszählung verwendet nur neue Shelly-Messupdates (`batteryMeasurementToken`), nicht den 250-ms-AI-Tick. / 稳定样本只按新的 Shelly 测量更新计数，而不是按 AI 250ms 定时循环重复计数。

Normaler Ablauf / 正常流程：

```text
BATTERY_RAMPING
  |
  +-- elapsed < 3 s ----------------------> wait
  |
  +-- fresh samples, |Delta I| <= 0.02 A
  |        three times after min settle --> BATTERY_STABLE
  |
  +-- elapsed >= 10 s --------------------> timeout, use latest measured state
```

`Battery effective minimum = 0.10 A` wird während `BATTERY_RAMPING` nicht angewendet. Erst nach Stabilisierung/Timeout kann die Battery als ineffective bewertet werden. / 电池爬升期间不执行 0.10A 无效判断，稳定或超时后才判断。

---

# 8. Hard-Limit-Verhalten während Ramping / 爬升期间硬限制

Normale VUF-Optimierung pausiert während `BATTERY_RAMPING`, aber harte Standortgrenzen bleiben aktiv. / Battery Ramping 时普通 VUF 优化暂停，但 Site Hard Limit 始终检查。

```text
Battery ramping
    |
    +-- normal (<100% hard headroom) -> wait for stable
    |
    +-- >=100% configured site limit -> immediate safety/headroom override
                                      -> compare HP -1 / WB -1
                                      -> Battery OFF as last resort
```

Auch ein noch nicht bestätigter Battery-ON-Befehl kann bei Erreichen der 100-%-Site-Grenze durch einen Battery-OFF-Override abgebrochen werden. / 即使 Battery ON 还处于 pending，只要达到 100% Site Hard Limit，也可以立即发 Battery OFF 覆盖命令。

---

# 9. Interne, nicht sichtbare Konstanten / 内部隐藏常量

```text
Battery reference max      = 1.30 A
Headroom pre-limit         = 90%
Hard ratio                 = 100%
Minimum VUF improvement    = 0.01 percentage point
Battery min settle         = 3 s
Battery stable delta       = 0.02 A
Battery stable samples     = 3
Battery max settle         = 10 s
Wallbox settle             = 2 s
Heatpump settle            = 5 s
Voltage candidate guard    = 207–253 V
```

Diese Werte bleiben bewusst aus der normalen UI entfernt. / 这些参数有意不在普通用户界面暴露。

---

# 10. Real-current display / 实测比例显示

Weiterhin enthalten / 继续保留：

Heatpump measured curve / 热泵实测：

```text
L1 0.09 A
L2 0.16 A
L3 0.21 A
L4 0.24 A
L5 0.26 A
```

Wallbox measured curve / Wallbox 实测：

```text
mask1 0.14 A
mask2 0.30 A
mask3 0.42 A
```

Building-Twin current display follows live Shelly current. Battery scaling saturates at the internal `1.30 A -> 40 A` reference. / Building Twin 电流显示继续随 Shelly 实测同步变化，Battery 超过 1.30A 后仍封顶 40A。

---

# 11. VUF-History-Fix / VUF 曲线修复

Der 10-s-Verlauf bleibt erhalten. Wenn nur noch ein gültiger History-Punkt im Fenster vorhanden ist, wird dieser bis `performance.now()` weitergezeichnet. / 继续保持 10 秒窗口；只剩一个有效点时把最后值延伸到当前时间，因此稳定 VUF 曲线不会在约 10 秒后消失。

Kernbedingung / 核心修改：

```js
if (points.length === 0) {
  return;
}
```

statt `points.length < 2`.

---

# 12. Nicht in dieser Version / 本版暂不实现

- CUF als aktives AI-Regelsignal / CUF 主动控制
- Schieflast als aktives AI-Regelsignal / Schieflast 主动控制
- Online-ML / Reinforcement Learning
- automatisches Lernen harter Schutzgrenzen
- Branch-B/Battery command-id correlation

CUF/Schieflast sind für die nächste Architekturphase vorgesehen. / CUF/Schieflast 按用户要求留到第二版控制架构。

---

# 13. Tests / 测试

Automatisierte Node-Regressionen / 自动 Node 回归：

```text
TEST_COUNT=38
TEST_FAIL=0
```

Zusätzliche Syntaxchecks / 额外语法检查：

```text
client/src/*.js              PASS
server/*.js                  PASS
SimpleDashboard <script>     PASS
AgentCard <script>           PASS
VufCard <script>             PASS
```

**Grenze / 限制：** Das ist keine HIL-Freigabe. Ein vollständiger Vite-Produktionsbuild wurde in dieser Delivery-Umgebung nicht ausgeführt, weil `client/node_modules` fehlt und die Offline-NPM-Auflösung nicht alle Pakete im Cache hatte. Vor echtem Hardwarebetrieb sollen Battery-Ramp, Hard-Limit-Override, MQTT/Status-Feedback und Branch-A-Verhalten auf dem Pi5/HIL geprüft werden. / 这些测试不是硬件 HIL 放行；正式上真实硬件前仍需在 Pi5/HIL 上验证。

---

# 14. Empfohlene Real-Hardware-Testsequenz / 推荐实机验证顺序

1. AI Control OFF，验证 Battery 手动 ON 时 Shelly 电流/P/Q 逐步上升且 VUF 同步变化。
2. AI Control ON，制造 `raw VUF > 2.00%`，确认 Battery OFF->ON 预测使用 1.04A。
3. 确认 Battery ON 后进入 `BATTERY RAMPING`，不会在电流尚未稳定时继续普通 HP/WB 调节。
4. 确认连续 3 个 fresh samples 且 `ΔI <=0.02A`、并已超过 3s 后退出 RAMPING。
5. 测试 >10s 不稳定时 timeout 后仍可继续控制。
6. 配置 Site Limit，在 Battery ramp 中模拟/触发 100% hard limit，确认立即 Headroom Override。
7. 输入 `1,04`、`1.234`、`abc`、超范围值，确认只出现英文错误且 active 参数不变。
8. 收起 Grid Impedance，确认 VUF 模型值不因收起动作发生变化；刷新页面确认折叠状态记忆。

