# SIMULATION / REAL HARDWARE Integration

- Added `client/src/SimulationRuntime.js`.
- Default UI mode is safe local `SIMULATION`.
- Added `SIMULATION <-> REAL HARDWARE` switch to the real `SimpleDashboard`.
- Simulation uses the same `onEnergyMeter -> projection -> PhasorCalculator -> AgentCard` path as real data.
- Simulation actuator calls never delegate to App.js/MQTT/Socket.IO.
- Added Balanced/L1 Overload/L2 Overload and L3 fault injection controls.
- Added explicit `DIGITAL TWIN SIMULATED` source label.
- Added connection gate for REAL HARDWARE when Pi5 is unavailable.
- Added `tests/simulation_runtime_test.mjs`.
- Preserved Bugfix3 behavior for raw/measured/projected separation, null fail-closed, and battery charging semantics.
