# Senergate v1.5.1 – Branch-A First-Click / RECHECK Race Fix
# Senergate v1.5.1——Branch A 首次点击与 RECHECK 竞态修复

**Frontend build / 前端版本:** `v1.5.1-branchA-race-recheck-fix`  
**Basis / 基线:** v1.5 P/Q calibrated VUF demo

## 1. Fehlerbild / 问题现象

- Erster Klick auf Heatpump-Level: Pending-Ziel wird angezeigt, aber L1-Building-Twin-Balken bleibt 0 A oder springt zurück.
- Zweiter Klick funktioniert.
- `RECHECK` kann bekannte Geräte-/Twin-Zustände kurz löschen, wodurch Balken verschwinden.
- Shelly-Messwerte und P/Q-/VUF-Berechnung sind davon nicht betroffen.

中文：第一次点击 Heatpump 后，AgentCard 已显示 pending 目标，但 L1 Building-Twin 柱条可能仍为 0 A 或被旧状态覆盖；第二次点击才正常。RECHECK 之前会复用 Cold Start Reset，导致已知状态被清空。

## 2. Root Cause / 根因

### A. Branch-A command/status race

ESP32 已提供：

```text
ACK.cmd_id
STATUS.last_cmd_id
```

旧前端没有使用这两个字段关联命令。因此，新 `start,40` 发出后，一个迟到的旧 `READY/STOP` status 可以把刚设置的 `twinLevel=4` 重新写成 0，并清除 `commanded`。

### B. RECHECK = Cold Reset

旧 `retryInitialization()` 重新调用 `bindRuntime()`，最终执行 `markRealStateWaiting()`，把 Heatpump/Wallbox/Battery/Twin 状态清成 `null`。RECHECK 应是 refresh，而不是 reset。

## 3. Fix / 修复内容

### 3.1 New correlation helper

新增：

```text
client/src/BranchACommandCorrelation.js
```

规则：

1. 新命令记录发送前的 `last_cmd_id` / ACK id。
2. 新 ACK 到达后把 `ACK.cmd_id` 绑定到当前 command generation。
3. 当前 command 存在时：
   - `STATUS.last_cmd_id != ACK.cmd_id` → 旧/无关 status，只更新诊断 payload，不覆盖执行/Twin 状态。
   - ACK 尚未到达 → 保留首次点击的 command trajectory。
   - `SAFE_MODE/FAULT/ERROR` → 无条件立即生效，不受 cmd_id 过滤。
4. START command ACK 后，如果本地状态暂时仍是 `READY/STOP`，认为是 Modbus start sequence 尚未切换状态，不允许清除 trajectory。
5. `RUNNING + actual level == target level` 才结束 start command lifecycle。

### 3.2 Stable first-click Building-Twin trajectory

第一次点击 Level 4：

```text
start,40
-> twinLevel = 4 immediately
-> P/Q Building Twin L1 updates immediately
```

即使后续 RFRD 暂时仍是旧 Level，执行真值 `confirmedLevel` 可以继续反映实际频率，但模型柱条保持当前 command trajectory，直到物理目标确认或 Safety/Reject 发生。

### 3.3 ESP32 ACK rejection rollback

Node RPC 的 `accepted:true` 只代表命令已通过 Pi5 校验并发布 MQTT。真正 ESP32 ACK 如果 rejected，则 Building-Twin command projection 回滚到上一状态。

### 3.4 RECHECK preserves state

READY 后点击 RECHECK：

```text
keep current Heatpump/Wallbox/Battery/Twin state
-> request fresh Shelly / Branch-A / Branch-B / Battery status
-> fresh events atomically update state
```

RECHECK 不再调用 `markRealStateWaiting()`，不再清空柱状图。

Cold Start / 首次连接仍保持 fail-closed：初始化时继续从 UNKNOWN 开始并要求 fresh hardware state。

## 4. Safety behavior / 安全行为

`SAFE_MODE`, `FAULT`, `ERROR` 永远是 authoritative。即使 `last_cmd_id` 与当前 command 不匹配，也立即覆盖模型/执行状态，不能被 stale-status filter 忽略。

## 5. Tests / 测试

新增：

```text
branchA_command_status_race_test.mjs
branchA_correlation_static_test.mjs
recheck_preserve_state_static_test.mjs
```

覆盖：

- old READY before new ACK
- stale ACK
- correlated transient READY after START ACK
- STARTING target fallback
- RUNNING actual-frequency lag
- RUNNING target confirmation
- FAULT override
- RECHECK state preservation

**30/30 regression tests PASS.**
