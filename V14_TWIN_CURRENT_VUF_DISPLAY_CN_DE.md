# Senergate v1.4 — Twin Current + VUF Display Update
# Senergate v1.4——数字孪生电流与 VUF 显示更新

**Version / 版本:** v1.4-twin-40-64-40-vuf-1dp  
**Date / 日期:** 2026-09-12

## 1. Gerätemodell / 设备模型

| Phase | Building-Twin model / 模型 | Maximum / 最大值 |
|---|---|---:|
| L1 | 2 equivalent Heat-Pump modules / 2 台等效热泵模块 | 40 A |
| L2 | 4 equivalent Wallboxes / 4 台等效 Wallbox | 64 A |
| L3 | Building Battery / 楼宇电池 | 40 A |

Heat-pump levels / 热泵档位:

```text
Level 0 =  0 A
Level 1 =  8 A
Level 2 = 16 A
Level 3 = 24 A
Level 4 = 32 A
Level 5 = 40 A
```

Branch B remains / Branch B 保持:

```text
Relay 0 ON = 32 A = 2 equivalent wallboxes
Relay 1 ON = 32 A = 2 equivalent wallboxes
Both ON     = 64 A = 4 equivalent wallboxes
```

Battery / 电池:

```text
OFF = 0 A
ON  = 40 A
```

## 2. Phase-current display / 相电流显示

**DE:** Shelly-Messströme und Building-Twin-Ströme werden sichtbar getrennt. Die gemessenen Prototype-Ströme werden mit zwei Dezimalstellen angezeigt. Das Building-Twin-Diagramm verwendet eine feste Skala von 0–100 A.

**中文：** Shelly 实测电流和 Building-Twin 模型电流明确分开。Prototype 实测电流显示两位小数；Building-Twin 柱状图固定采用 0–100 A 范围。

## 3. Einheitliche VUF-Darstellung / VUF 显示统一

`VufCard.vue` und `AgentCard.vue` verwenden jetzt gemeinsam `VufPresentation.js`.

`VufCard.vue` 与 `AgentCard.vue` 现在统一调用 `VufPresentation.js`。

```text
Display precision / 显示精度: 1 decimal / 小数点后一位
Balanced / 平衡:            < 1.0 %
Warning / 警告:              1.0–2.0 %
Critical / 严重:             > 2.0 %
```

Beispiele / 示例:

```text
internal 1.16 % -> display 1.2 %
internal 1.94 % -> display 1.9 %
```

Die VUF-Karte und `Grid condition` erhalten weiterhin denselben `currentVuf`-Wert. / VUF Card 与 Grid condition 继续使用同一个 `currentVuf`。

## 4. Hinweis zum Demo Feeder / Demo Feeder 注意事项

Das vorhandene Demo-Feeder-Modell bleibt bewusst unverändert. Es ist weiterhin ein nicht standortkalibriertes Modell. Bei hohen einphasigen modellierten Strömen kann es sehr große Spannungsabfälle erzeugen. Dies ist getrennt von der aktuellen Änderung des Gerätestrommodells zu kalibrieren.

当前 Demo Feeder 参数本次没有自动修改。它仍然属于非现场标定的演示模型；在较大的单相模型电流下可能产生较大的模拟压降。该参数应与本次设备电流模型修改分开进行后续标定。

## 5. Regression tests / 回归测试

All existing tests plus the new display/model tests pass. / 现有测试以及新增的显示与模型测试全部通过。

New tests / 新增测试:

```text
current_card_measured_modeled_static_test.mjs
vuf_presentation_consistency_test.mjs
```
