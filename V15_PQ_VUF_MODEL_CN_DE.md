# Senergate REAL HARDWARE v1.5 — P/Q Building Model + Estimated VUF
# Senergate REAL HARDWARE v1.5——P/Q 楼宇模型 + Estimated VUF

**Build marker / 版本标识:** `v1.5-pq-calibrated-vuf-demo`  
**Basis / 基线:** P03 Branch-A semantics + REAL-HARDWARE-only dashboard

## 1. Bestätigte Designentscheidungen / 已确认设计

- Branch A Heat-Pump group: `0–40 A` building-equivalent capacity, 2 equivalent HP modules.
- Branch B Wallbox group: `0–64 A`, 4 equivalent Wallboxes.
- L3 Building Battery: `0–40 A`; Battery is physically measurable through Shelly.
- VUF remains the main demo/control indicator.
- Explicit `Demo Weak Grid` is retained so strongly unbalanced scenarios can reach `VUF > 2.5%`.
- Every AI candidate is rejected if projected phase voltage is outside `207–253 V`.
- Voltage angles use `0°/-120°/+120°` until synchronized three-phase voltage-angle measurement exists.
- Measured / Execution / Modeled / Estimated data are kept separate.

## 2. Neue elektrische Modellkette / 新的电气建模链

```text
Shelly U/I/P/S/PF + optional Pico FFT fundamental ratio
                    ↓
Prototype P/Q calibration profiles
                    ↓
Scale P and Q together to building capacity
                    ↓
S = P + jQ
                    ↓
I = conj(S / V)
                    ↓
Incremental feeder model
Vproj = VPCC,baseline - Zphase·ΔI - ZN·ΔIN
                    ↓
V1 / V2 symmetrical components
                    ↓
Estimated VUF = |V2| / |V1| × 100%
```

Die alten phasenabhängigen Stromfaktoren `800/400/230` werden für die VUF-Berechnung nicht mehr verwendet. / 旧的按相 `800/400/230` 电流放大不再参与 VUF 计算。

## 3. Kalibrierung / 校准

Backend service: `server/ElectricalCalibrationService.js`

Persistent file / 持久化文件:

```text
server/config/electrical_profiles.json
```

### Baseline

`CAPTURE 10 s BASELINE` records the PCC state. All controllable devices should be OFF/ZERO before capture.

### Automatic P/Q calibration

`RUN P/Q CALIBRATION` requires explicit operator confirmation and then executes:

```text
all devices OFF → 10 s baseline
Heat Pump level 1..5 → settle 6 s + capture 10 s each
Wallbox mask 1/2/3 → settle + capture
Battery ON → settle + capture
safe OFF state at end
```

The service first uses Shelly P/S/PF. If a recognized Pico fundamental ratio is available, the P/Q point is improved with the fundamental current ratio. Otherwise a Shelly-based fallback is retained and labeled accordingly.

## 4. Building scaling / 楼宇缩放

A measured prototype point `(Pproto,Qproto)` is scaled by one factor per device class:

```text
Pbuilding = Kdevice · Pproto
Qbuilding = Kdevice · Qproto
```

Therefore the P/Q ratio is preserved. The class maximum is normalized to:

```text
Heat Pump  ≈ 40 A @ 230 V
Wallbox    ≈ 64 A @ 230 V
Battery    ≈ 40 A @ 230 V
```

The 40/64/40 A values are capacity targets, not raw measured currents.

## 5. Demo Weak Grid / Demo 弱电网

Preset:

```text
Rphase = 0.22 Ω
Xphase = 0.15 Ω
RN     = 0.02 Ω
XN     = 0.00 Ω
```

This is explicitly labeled `MODELED DEMO · NOT SITE CALIBRATED`.

Reference regression case:

```text
Baseline voltage = 230/230/230 V
Heat Pump = 0
Wallbox = 64 A equivalent on L2
Battery = OFF
```

Expected with fallback near-unity Wallbox PF:

```text
Estimated VUF ≈ 2.52%
Projected voltages ≈ 230.7 / 213.9 / 230.5 V
```

So the prototype can demonstrate `VUF > 2.5%` without using different arbitrary current multipliers per phase, while remaining inside the 207–253 V guard in this reference case.

## 6. AI control / AI 控制

AI still uses **total Estimated VUF** as its main indicator.

Trigger logic remains:

```text
Critical > 2.0%
Release  < 1.9%
Confirm  1 s
Settle   10 s
Minimum predicted improvement = 0.10 percentage points
```

Additional hard constraint:

```text
Reject candidate if any projected phase voltage <207 V or >253 V.
```

A candidate with a lower VUF but unacceptable voltage is therefore not actuated.

## 7. UI semantics / UI语义

- `SHELLY · MEASURED`: real prototype phase currents, two decimals.
- `BUILDING TWIN · MODELED`: P/Q-derived equivalent currents, graph 0–100 A.
- `Voltage Phasor Estimate`: projected complex voltage magnitude **and calculated angle**.
- `Estimated three-phase voltage unbalance`: total model-estimated VUF.
- VUF and `Grid condition` both use one decimal and the same rounded value/classification.

## 8. Important limitation / 重要限制

This remains an **Estimated VUF**, not an IEC 61000-4-30 compliant measured VUF. Shelly provides voltage magnitudes but not synchronized three-phase voltage phasor angles. The ideal 120° angles and feeder impedance remain model assumptions.

当前仍然是 **Estimated VUF**，不是 IEC 61000-4-30 合规的真实 VUF 测量。若未来需要真实 VUF，需要三相同步电压波形/相角测量。

## 9. Tests / 测试

The package contains regression tests for:

- P/Q scaling preserving P/Q ratio;
- 40/64/40 A capacity targets;
- Demo Weak Grid `VUF >2.5%` reference case;
- 207–253 V validity;
- one-decimal VUF display/status consistency;
- Branch-A STOP/ZERO_HOLD semantics;
- command-pending behavior;
- calibration service presence and persistence contract.
