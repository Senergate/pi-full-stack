# Senergate v1.5.1 AI CONTROL I – Hard-Limit Operator Override / Hard-Limit 覆盖用户调节边界

## Deutsch
Diese Version basiert direkt auf AI CONTROL H und ändert nur den Konfliktfall zwischen Building-Capacity-Hard-Limit und Operator Adjustability. Unterhalb des Hard-Limits bleibt die Bedien-Eingriffsgrenze unverändert bindend. Bei Capacity >= 100 % werden zuerst weiterhin alle innerhalb der Bediengrenze zulässigen, kapazitätsreduzierenden Ein-Schritt-Aktionen geprüft. Erst wenn dort keine weitere Reduktion verfügbar ist, darf Heatpump oder Wallbox die konfigurierte Bediengrenze um genau eine Stufe unterschreiten. Level 1 bleibt die minimale automatische Stufe; Heatpump STOP/ZERO_HOLD und Wallbox OFF werden durch diesen Override nicht neu eingeführt.

Der gespeicherte Adjustability-Wert wird nicht verändert. Die UI zeigt einen roten HARD-LIMIT-OVERRIDE-Hinweis mit Asset, konfigurierter Grenze und temporärem Ziel. Sobald die Building Capacity wieder unter dem Hard-Limit liegt, wird der Runtime-Override beendet. Es erfolgt kein automatisches Hochregeln.

## 中文
本版本直接基于 AI CONTROL H，只修复 Building Capacity Hard Limit 与 Operator Adjustability 的冲突。低于 Hard Limit 时，用户设定的调节下限仍然严格有效。当 Capacity >= 100% 时，系统仍优先使用不突破用户边界的合法减载动作；只有这些动作已经不存在时，才允许 Heatpump 或 Wallbox 临时突破用户设置，一次仅下降一档。自动最低仍为 Level 1；本次 Override 不会新增 Heatpump STOP/ZERO_HOLD 或 Wallbox OFF。

用户保存的 Adjustability 数值不会被修改。前端会显示红色 HARD LIMIT OVERRIDE 警告，包括被覆盖的设备、配置下限和紧急目标档位。Building Capacity 回到 Hard Limit 以下后，运行时 Override 自动解除；由于系统保持 downshift-only，不会自动升档恢复。

## 保留的不变量 / Beibehaltene Invarianten
- One-step control / 每次只改变一个设备
- HP/WB automatic upshift forbidden / 禁止自动升档
- Voltage guard remains mandatory / 电压保护仍然强制
- Pending → Confirmed → Settling unchanged
- Battery remains bidirectional
- Operator Adjustability is overridden only at Capacity HARD limit
- Saved Adjustability values are never rewritten by the override
