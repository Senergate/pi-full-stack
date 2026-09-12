# v1.5.3 Fallback Profile Runtime Fix / 回退 P/Q 模型运行修复

## 中文

### 现象
Dashboard 已经收到真实硬件状态，例如 Heat pump 3/5、Wallbox 2/3、Battery ON，但 Building Twin 三相电流仍显示 0 A，VUF 仍为 0.0%。

### 根因
后端 `ElectricalCalibrationService._defaultProfiles()` 在尚未执行真实 P/Q 校准时仍会返回 heatpump/wallbox/battery 资产对象，但 `points` 是空对象 `{}`。
前端旧逻辑只要发现资产对象存在，就完全使用该对象，不再使用 `DEFAULT_ELECTRICAL_PROFILES` 的 normalized fallback points。
因此 `pointFor()` 得到 `null`，随后 `modelAssetPower()` 返回 `missing_point`，最终三个支路的 P/Q 全部为 0。

### 修复
`ElectricalProfileModel.getAsset()` 改为“默认 fallback profile + 后端 profile”的合并策略：
- 默认 normalized P/Q points 作为底层 fallback；
- 后端真实 calibration points 按 state 覆盖 fallback；
- `target_current_a`、`phase`、`q_sign` 继续采用后端/当前配置；
- 未校准时仍能计算 Building Twin；
- 完成真实校准后仍优先使用真实 P/Q 数据。

### 测试策略调整
按要求移除了“Branch A/B 单支路必须 VUF > 2.3%”的硬阈值回归测试。该测试本身不会参与浏览器/Node 运行时，也不会导致 Dashboard 失效，但它会约束未来测试流程中的模型参数修改，因此不再保留。
新增的 `fallback_profile_runtime_model_test.mjs` 只验证：后端未校准 profile 为 `{points:{}}` 时，前端 fallback 模型仍必须产生非零 P/Q。它不锁定 VUF 数值或 Grid-Z。

## Deutsch

### Symptom
Obwohl reale Hardwarezustände vorhanden sind, z. B. Heat Pump 3/5, Wallbox 2/3 und Battery ON, zeigt der Building Twin weiterhin 0 A und der VUF bleibt bei 0.0%.

### Ursache
`ElectricalCalibrationService._defaultProfiles()` liefert vor einer realen P/Q-Kalibrierung bereits Asset-Objekte, deren `points` jedoch leer sind. Die alte Frontend-Logik behandelte diese leeren Assets als vollständig autoritativ und verdrängte dadurch die normalisierten Fallback-Punkte aus `DEFAULT_ELECTRICAL_PROFILES`.
Das Ergebnis war `missing_point` und damit P=Q=0 für alle Assets.

### Korrektur
`ElectricalProfileModel.getAsset()` merged nun das Default-Fallback-Profil mit dem geladenen Backend-Profil:
- normalisierte Default-Punkte bleiben als Fallback verfügbar;
- reale Kalibrierpunkte überschreiben den Fallback zustandsweise;
- `target_current_a`, Phase und Q-Richtung bleiben aus der aktuellen Konfiguration erhalten;
- das Modell funktioniert auch ohne Kalibrierung;
- nach echter Kalibrierung werden weiterhin reale P/Q-Punkte bevorzugt.

### Teststrategie
Der harte Regressionstest „Branch A/B single max must exceed 2.3% VUF“ wurde entfernt. Er lief nicht im Runtime-Pfad und war daher nicht die Ursache des 0-A-Problems, würde aber zukünftige Modelländerungen unnötig auf genau diesen Schwellenwert festlegen.
Der neue kleine Funktionstest prüft nur, dass ein unkalibriertes Backend-Profil mit leeren `points` weiterhin zu einem funktionsfähigen Fallback-P/Q-Modell führt.
