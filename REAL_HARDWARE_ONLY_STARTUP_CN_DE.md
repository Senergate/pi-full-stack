# Senergate REAL-HARDWARE-Only Startup / 仅真实硬件启动

## Deutsch
- SIMULATION-Oberfläche und Runtime-Umschaltung wurden entfernt.
- Die Anwendung verbindet sich beim Start direkt mit dem Pi5.
- Gerätezustände starten als `null/WAITING`, nicht als angenommene 0-Werte.
- Sobald die Services verfügbar sind, sendet der Client einmalig STOP/OFF an Heatpump, beide Wallbox-Relais und Battery.
- Erst danach werden Listener gebunden und frische Status-/Messwerte angefordert.
- Building-Twin-Ströme bleiben `NO DATA`, bis die benötigten realen Gerätezustände bekannt sind.
- Simulation-Payloads werden in der REAL-HARDWARE-Oberfläche verworfen.

## 中文
- 删除 SIMULATION 页面和 Runtime 切换。
- 应用启动后直接连接 Pi5。
- 设备初始状态使用 `null/WAITING`，不再假定为 0。
- Pi5 services 可用后，客户端首先向 Heatpump、两个 Wallbox Relay 和 Battery 发送一次 STOP/OFF。
- 然后绑定监听并请求新的真实状态/测量值。
- 在所需真实执行状态未确认前，Building Twin 电流保持 `NO DATA`。
- REAL HARDWARE 页面拒绝任何带 simulation 标记的数据。

## Initial display rule / 首次显示规则
- Before the first valid Shelly/EnergyMeter update, projected currents are `null` and the current/VUF panels remain NO DATA.
- 在首次有效 Shelly/EnergyMeter 更新之前，投影电流保持 `null`，Current/VUF 卡片不会预先显示模型电流。
