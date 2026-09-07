# Pending-State-Fix / Pending 状态修复

## Deutsch

- Ein bestehender Pending-Zustand bleibt beim Umschalten von `AI CONTROL ON/OFF` erhalten.
- Ein reiner AI-Prediction-Wert überschreibt nicht mehr den dargestellten Geräte-Istzustand.
- Ein Pending-Ziel steuert weiterhin die sichtbaren Segmente, damit die Benutzeraktion sofort erkennbar bleibt.
- Pending wird erst gelöscht, wenn der gemeldete Gerätezustand dem Pending-Ziel entspricht.
- Solange ein Befehl Pending ist, erzeugt die AI-Regelung keinen konkurrierenden Folgebefehl.
- `PREDICTED` und `COMMAND PENDING` können gleichzeitig und unabhängig sichtbar sein.

## 中文

- 切换 `AI CONTROL ON/OFF` 时保留现有Pending状态。
- 单纯的AI Prediction不再覆盖界面中的设备状态。
- Pending目标继续控制可见蓝条，让用户点击后立即获得反馈。
- 只有设备反馈状态与Pending目标一致时，Pending才自动清除。
- 存在Pending命令时，AI不会生成与其冲突的新控制命令。
- `PREDICTED`和`COMMAND PENDING`标记可以独立、同时显示。

## Verification / 验证

- All project `.mjs` tests passed.
- Vue/Vite production build passed.
