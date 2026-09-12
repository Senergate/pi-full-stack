# Branch A/B 单支路最大值 VUF > 2.3% Patch / Patch für VUF > 2,3% bei Einzelzweig-Maximum

**Version / 版本:** v1.5.2-branchAB-vuf23

## 中文
- Branch A Building-Twin 最大等效电流：40 A → **60 A**。
- Branch B 保持 **64 A**。
- Demo Grid 保持对称：Rphase=0.26 Ω, Xphase=0.091 Ω, RN=0.03 Ω, XN=0.01 Ω。
- 这只改变 MODELED Building-Twin 容量，不改变真实 ATV12 的 50 Hz 上限。
- 新增/加强回归测试：Branch A 最大单独运行和 Branch B 最大单独运行都必须 `VUF > 2.3%`，并保持预测电压在 `207–253 V`。
- 已有 `server/config/electrical_profiles.json` 如果仍保存 40 A，不需要重新做硬件校准：加载时自动把 Building-Twin target 迁移为 60 A，同时保留原来的实测 P/Q points 和 baseline。
- Branch A 的 STOP override、ZERO_HOLD、STOP 后 full start、RUN refresh guard、Modbus single-owner 均未修改。

## Deutsch
- Building-Twin-Maximalstrom für Branch A: 40 A → **60 A**.
- Branch B bleibt bei **64 A**.
- Das symmetrische Demo-Netz bleibt unverändert: Rphase=0.26 Ω, Xphase=0.091 Ω, RN=0.03 Ω, XN=0.01 Ω.
- Die Änderung betrifft ausschließlich die MODELED Gebäudeäquivalenz; das reale ATV12-Maximum bleibt 50 Hz.
- Regression: Sowohl Branch A allein auf Maximum als auch Branch B allein auf Maximum müssen `VUF > 2.3%` erreichen und innerhalb des `207–253 V`-Guards bleiben.
- Bereits vorhandene `server/config/electrical_profiles.json` mit 40-A-Branch-A-Ziel werden beim Laden automatisch auf 60 A migriert; gemessene P/Q-Punkte und Baseline bleiben erhalten. Eine erneute Hardwarekalibrierung ist dafür nicht erforderlich.
- Die Branch-A-Sicherheitsinvarianten (STOP Override, ZERO_HOLD, Full Start nach STOP, RUN Refresh Guard, Single-Owner-Modbus) bleiben unverändert.
