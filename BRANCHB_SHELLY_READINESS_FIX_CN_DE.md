# Senergate Branch-B Shelly Readiness Fix
# Senergate Branch-B Shelly 在线判断修正

**Stand / 日期:** 2026-09-10

## 1. Problem / 问题

**DE:** Die Startup-Initialisierung hat Branch B fälschlich über einen alten ESP32-B-Statuspfad geprüft (`senergate/state/branchB/status`). Im aktuellen Prototype wird Branch B jedoch direkt über `WallboxService` und die beiden Shelly-Relay-/Widerstandskanäle betrieben.

**中文：** Startup 初始化之前错误地等待旧的 ESP32-B 状态路径 (`senergate/state/branchB/status`)。当前 Prototype 的 Branch B 实际通过 `WallboxService` 直接控制两路 Shelly Relay / 电阻负载，因此旧判断会导致 Branch B 永远 offline 并触发 Initialization Timeout。

## 2. Neue Online-Definition / 新在线定义

Branch B gilt nur dann als READY, wenn beide realen Shelly-Schaltkanäle bekannt und frisch sind:

```text
Relay 0 state known + update age < 3 s
AND
Relay 1 state known + update age < 3 s
= Branch B READY
```

中文：

```text
Relay 0 状态已知 + 更新时间 < 3 s
AND
Relay 1 状态已知 + 更新时间 < 3 s
= Branch B READY
```

## 3. Startup-Gate / 启动门控

Startup erwartet jetzt nach `WallboxService.requestUpdate()` ausdrücklich neue Antworten für beide Relais:

```text
startupRequestReceived(wallbox.r0Update)
AND
startupRequestReceived(wallbox.r1Update)
AND
branchBReady
```

因此 retained/旧 UI 值不能直接通过本次 Startup gate。

## 4. Entfernte Legacy-Pfade / 删除的旧路径

Aus `EspService` entfernt:

```text
senergate/sys/request/branchB/status
senergate/state/branchB/status
senergate/state/branchB/ack
wallbox/relay/<id>
senergate/config/branchB/compat_safety_bypass
```

Aus dem Vue-Frontend entfernt:

```text
branchBState
EspService branchB listener
EspService branchB_ack listener
BranchBService listener
realFeedback.branchB
```

Branch A bleibt vollständig in `EspService`.

## 5. Verbleibender Branch-B-Pfad / 当前 Branch-B 路径

```text
Vue
  -> WallboxService.set(0/1, state)
  -> Pi5 Node WallboxService
  -> MQTT branch-b-shelly/command/switch:0|1
  -> Shelly/Relay bridge
  -> MQTT branch-b-shelly/status/switch:0|1
  -> WallboxService data event
  -> Vue wallbox.r0/r1 + r0Update/r1Update
  -> branchBReady
```

## 6. Pico / Pico说明

**DE:** Der aktuelle `PicoService` ist in dieser Codebasis ein Messpfad. Er besitzt derzeit keinen Branch-B-Aktor- oder Relay-Control-Contract. Deshalb wird Pico nicht künstlich in `branchBReady` eingebaut.

**中文：** 当前代码中的 `PicoService` 是测量路径，并没有 Branch-B Relay 控制接口。因此这次不会把 Pico 强行加入 `branchBReady`。如果后续实际硬件改为 Pico 控制 Relay，需要单独增加对应的 actuator/status contract。

## 7. Tests / 测试

Alle Tests PASS, einschließlich des neuen Tests:

```text
branchb_shelly_readiness_static_test.mjs  PASS
startup_initialization_static_test.mjs    PASS
real_hardware_vuf_demo_test.mjs           PASS
```

Zusätzlich wurden Syntax-Checks für `EspService.js`, `WallboxService.js` und den Vue `<script setup>`-Block ausgeführt: PASS.

`npm run build` wurde hier nicht ausgeführt, weil `client/node_modules` im Paket nicht enthalten ist.
