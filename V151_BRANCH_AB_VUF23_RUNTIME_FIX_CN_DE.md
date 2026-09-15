# Senergate v1.5.1 Branch-A/B VUF Runtime Fix / 运行修复

**Basis / 基线:** direkt `v1.5.1-branchA-race-recheck-fix`; keine Übernahme aus v1.5.2/v1.5.3.

- Branch A Building-Twin maximum: 40 A -> 60 A.
- Branch B remains 64 A; Battery remains 40 A.
- `points:{}` from the backend no longer erases frontend fallback P/Q points.
- Existing old `electrical_profiles.json` is normalized to the current building-scale target while preserving measured calibration points.
- No hard VUF threshold regression test is used to force Branch A/B >2.3%; tests only verify that the calculation remains valid/safe.
- Real Branch-A ESP32/ATV12 state machine, STOP override, ZERO_HOLD, Drivecom and Modbus logic are unchanged.

---

- Branch A 楼宇等效最大值：40 A -> 60 A。
- Branch B 保持 64 A，Battery 保持 40 A。
- 后端返回 `points:{}` 时，不再覆盖前端 fallback P/Q 曲线，因此未校准时也能计算 Building Twin / VUF。
- 如果 Pi5 已存在旧的 `electrical_profiles.json`，启动时只更新楼宇等效 target，保留原来的实测 calibration points。
- 不使用“Branch A/B 必须始终 VUF >2.3%”的硬阈值回归测试；测试只验证计算可用和安全边界。
- Branch A ESP32/ATV12 的状态机与安全逻辑不修改。
