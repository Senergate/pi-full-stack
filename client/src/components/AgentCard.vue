<template>
  <section class="agent-card">
    <div class="header">
      <div>
        <div class="eyebrow">Automatic control</div>
        <h2>Senergate AI Agent</h2>
      </div>

      <button type="button" class="control-toggle" :class="{ enabled: autoEnabled }" :disabled="!controlReady" @click="toggleAuto">
        <span class="toggle-track"><span class="toggle-knob" /></span>
        <span>
          <strong>{{ autoEnabled ? 'AI CONTROL ON' : 'AI CONTROL OFF' }}</strong>
          <small>{{ autoEnabled ? 'Battery-priority VUF control · voltage/headroom guards' : 'Operator control' }}</small>
        </span>
      </button>
    </div>

    <div class="status-grid">
      <div class="panel">
        <div class="panel-label">Grid condition</div>
        <div class="condition">
          <span class="dot" :class="condition.className" />
          <strong :class="condition.className">{{ condition.label }}</strong>
        </div>
        <div class="vuf-value">
          <span>{{ formatVuf(vuf) }}</span>
          <span v-if="['pending','adjusting','battery_ramping'].includes(agentState) && prediction" class="vuf-prediction">({{ formatVuf(prediction.vuf) }})</span>
        </div>
        <div class="thresholds">Control enter {{ vufEnterPct.toFixed(2) }}% · release {{ vufExitPct.toFixed(2) }}% · Battery predicted ON {{ batteryPredictedOnCurrentA.toFixed(2) }} A · effective ≥ {{ batteryEffectiveMinA.toFixed(2) }} A</div>
      </div>

      <div class="panel">
        <div class="panel-label">Agent state</div>
        <div class="condition">
          <span class="dot" :class="agentState" />
          <strong>{{ agentState.toUpperCase() }}</strong>
        </div>
        <p>{{ agentStateDescription }}</p>
        <div class="feedback-lines">
          <span>Branch A {{ latestFeedbackLines.branchA }}</span>
          <span>Branch B {{ latestFeedbackLines.branchB }}</span>
        </div>

        <div v-if="agentState === 'adjusting'" class="cooldown">
          <div class="cooldown-label">
            <span>Next VUF check</span>
            <strong>{{ cooldownRemaining.toFixed(1) }} s</strong>
          </div>
          <div class="cooldown-track">
            <div class="cooldown-fill" :style="{ width: `${cooldownProgress}%` }" />
          </div>
        </div>

        <div v-if="agentState === 'battery_ramping'" class="cooldown">
          <div class="cooldown-label">
            <span>Battery stabilization</span>
            <strong>{{ batteryRampElapsedS.toFixed(1) }} / {{ (BATTERY_CONTROL_INTERNALS.batteryMaxSettleMs / 1000).toFixed(1) }} s</strong>
          </div>
          <div class="cooldown-track">
            <div class="cooldown-fill" :style="{ width: `${batteryRampProgress}%` }" />
          </div>
          <div class="feedback-lines">
            <span>Current {{ Number.isFinite(Number(batteryMeasuredCurrentA)) ? `${Number(batteryMeasuredCurrentA).toFixed(2)} A` : '--' }}</span>
            <span>Stable updates {{ batteryRamp.stableCount }}/{{ BATTERY_CONTROL_INTERNALS.batteryStableSamples }} · ΔI ≤ {{ BATTERY_CONTROL_INTERNALS.batteryStableDeltaA.toFixed(2) }} A</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section-head">
      <div>
        <div class="panel-label">Control decision</div>
        <h3>{{ decisionStateTitle }}</h3>
      </div>
      <div class="decision-badges">
        <span v-if="prediction" class="badge">PREDICTED</span>
        <span v-if="hasPendingDevice" class="badge pending-badge">COMMAND PENDING</span>
        <span v-if="agentState === 'battery_ramping'" class="badge pending-badge">BATTERY RAMPING</span>
      </div>
    </div>

    <div class="devices">
      <div class="device" :class="{ pending: pendingDevices.heatpump, unknown: normalizedDeviceStates.heatpump === null }">
        <div class="device-head">
          <span>Heat pump</span>
          <span>L1</span>
        </div>

        <div class="device-value">{{ formatDeviceLevel(displayedState.heatpump) }} <small>/ 5</small></div>
        <small v-if="pendingDevices.heatpump" class="pending-note">pending → {{ pendingTargetState.heatpump }}/5<span v-if="pendingHeatpumpMode"> · {{ pendingHeatpumpMode.toUpperCase() }}</span></small>
        <small v-else-if="normalizedDeviceStates.heatpump === null" class="pending-note">waiting for Branch-A status</small>

        <div class="segments">
          <button
            v-for="level in 5"
            :key="level"
            type="button"
            class="level-button"
            :class="{ active: displayedState.heatpump !== null && level <= displayedState.heatpump }"
            :disabled="manualControlDisabled"
            :title="`Set heat pump to level ${level}`"
            @click="setDeviceState('heatpump', level)"
          />
        </div>

        <button type="button" class="off-button" :class="{ active: normalizedHeatpumpMode === 'stop' }" :disabled="manualControlDisabled" title="Branch-A STOP: stop,0" @click="requestHeatpumpStop">STOP</button>
        <button type="button" class="off-button zero-hold-button" :class="{ active: normalizedHeatpumpMode === 'zero_hold' }" :disabled="manualControlDisabled" title="Branch-A ZERO_HOLD: start,0" @click="requestHeatpumpZeroHold">ZERO HOLD</button>
      </div>

      <div class="device" :class="{ pending: pendingDevices.wallbox, unknown: normalizedDeviceStates.wallbox === null }">
        <div class="device-head">
          <span>Wallbox</span>
          <span>L2</span>
        </div>

        <div class="device-value">{{ formatDeviceLevel(displayedState.wallbox) }} <small>/ 3</small></div>
        <small v-if="pendingDevices.wallbox" class="pending-note">pending → {{ pendingTargetState.wallbox }}/3</small>
        <small v-else-if="normalizedDeviceStates.wallbox === null" class="pending-note">waiting for Branch-B/Shelly status</small>

        <div class="segments three">
          <button
            v-for="level in 3"
            :key="level"
            type="button"
            class="level-button"
            :class="{ active: displayedState.wallbox !== null && level <= displayedState.wallbox }"
            :disabled="manualControlDisabled"
            :title="`Set wallbox to level ${level}`"
            @click="setDeviceState('wallbox', level)"
          />
        </div>

        <button type="button" class="off-button" :class="{ active: displayedState.wallbox === 0 }" :disabled="manualControlDisabled" @click="setDeviceState('wallbox', 0)">OFF</button>
      </div>

      <div class="device" :class="{ pending: pendingDevices.batteryCharging, unknown: normalizedDeviceStates.batteryCharging === null }">
        <div class="device-head">
          <span>Battery charging</span>
          <span>L3</span>
        </div>

        <small v-if="pendingDevices.batteryCharging" class="pending-note">pending → {{ pendingTargetState.batteryCharging ? 'ON' : 'OFF' }}</small>
        <small v-else-if="normalizedDeviceStates.batteryCharging === null" class="pending-note">waiting for battery status</small>

        <button
          type="button"
          class="binary clickable"
          :class="{ on: displayedState.batteryCharging === true }"
          :disabled="manualControlDisabled"
          @click="setDeviceState('batteryCharging', nextBatteryCommand)"
        >
          {{ formatBinary(displayedState.batteryCharging) }}
        </button>
      </div>
    </div>

    <div class="section-head">
      <div>
        <div class="panel-label">Agent activity</div>
        <h3>Decision log</h3>
      </div>
      <span class="badge">{{ logs.length }} events</span>
    </div>

    <div ref="logContainer" class="log">
      <div v-if="logs.length === 0" class="empty">No agent activity yet.</div>
      <div v-for="entry in logs" :key="entry.id" class="log-entry">
        <time>{{ entry.time }}</time>
        <span class="log-dot" :class="entry.type" />
        <div>
          <strong>{{ entry.title }}</strong>
          <p v-if="entry.message">{{ entry.message }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { classifyVuf, formatVufPercent } from '../VufPresentation.js';
import { BATTERY_CONTROL_INTERNALS, CONTROL_POLICY_DEFAULTS, PROTOTYPE_CURRENT_CURVES_A } from '../ControlPolicyConfig.js';

const TICK_MS = 250;
const MAX_HEATPUMP = 5;
const MAX_WALLBOX = 3;
const MIN_LOAD_RATIO = 0.5;

const props = defineProps({
  vuf: { type: Number, required: false, default: null },
  deviceStates: { type: Object, required: true },
  predictVuf: { type: Function, required: true },
  controlReady: { type: Boolean, required: false, default: true },
  controlBlockedReason: { type: String, required: false, default: '' },
  commandFeedback: { type: Object, required: false, default: () => ({}) },
  controlPolicy: { type: Object, required: false, default: () => ({}) },
  measuredCurrents: { type: Object, required: false, default: () => ({ a: null, b: null, c: null }) },
  measuredTotalPowerW: { type: Number, required: false, default: null },
  batteryMeasuredCurrentA: { type: Number, required: false, default: null },
  batteryMeasurementToken: { type: Number, required: false, default: null },
});

const emit = defineEmits(['apply-state', 'enabled-change', 'heatpump-zero-hold', 'heatpump-stop']);

const autoEnabled = ref(false);
const agentState = ref('inactive');
const prediction = ref(null);
const logs = ref([]);
const logContainer = ref(null);
const cooldownUntil = ref(0);
const now = ref(Date.now());
const evaluating = ref(false);
const timer = ref(null);
const logId = ref(0);

const pendingDevices = reactive({ heatpump: false, wallbox: false, batteryCharging: false });
const pendingTargetState = reactive({ heatpump: null, wallbox: null, batteryCharging: null });
const pendingHeatpumpMode = ref(null);

const clampInt = (value, min, max) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};

const normalizedDeviceStates = computed(() => ({
  heatpump: clampInt(props.deviceStates?.heatpump, 0, MAX_HEATPUMP),
  wallbox: clampInt(props.deviceStates?.wallbox, 0, MAX_WALLBOX),
  batteryCharging:
    props.deviceStates?.batteryCharging === null || props.deviceStates?.batteryCharging === undefined
      ? null
      : props.deviceStates.batteryCharging === true,
}));

const normalizedHeatpumpMode = computed(() => {
  const raw = String(props.deviceStates?.heatpumpMode ?? '').toLowerCase();
  if (['start', 'running', 'starting'].includes(raw)) return 'start';
  if (['zero_hold', 'zero-hold', 'ramping_to_zero_hold'].includes(raw)) return 'zero_hold';
  if (['stop', 'stopped', 'ready', 'safe_mode', 'fault', 'error'].includes(raw)) return 'stop';
  return null;
});

const hasPendingDevice = computed(() => pendingDevices.heatpump || pendingDevices.wallbox || pendingDevices.batteryCharging);
const hasUnknownDeviceState = computed(() => Object.values(normalizedDeviceStates.value).some(value => value === null));
const nextBatteryCommand = computed(() => normalizedDeviceStates.value.batteryCharging !== true);
const manualControlDisabled = computed(() => autoEnabled.value || !props.controlReady);

const policyNumber = (key, fallback) => {
  const value = Number(props.controlPolicy?.[key]);
  return Number.isFinite(value) ? value : fallback;
};
const vufEnterPct = computed(() => policyNumber('vufEnterPct', CONTROL_POLICY_DEFAULTS.vufEnterPct));
const vufExitPct = computed(() => Math.min(vufEnterPct.value, policyNumber('vufExitPct', CONTROL_POLICY_DEFAULTS.vufExitPct)));
const batteryEffectiveMinA = computed(() => policyNumber('batteryEffectiveMinA', CONTROL_POLICY_DEFAULTS.batteryEffectiveMinA));
const batteryPredictedOnCurrentA = computed(() => policyNumber('batteryPredictedOnCurrentA', CONTROL_POLICY_DEFAULTS.batteryPredictedOnCurrentA));
const preLimitRatio = computed(() => BATTERY_CONTROL_INTERNALS.preLimitRatio);
const hardRatio = computed(() => BATTERY_CONTROL_INTERNALS.hardRatio);
const minImprovement = computed(() => BATTERY_CONTROL_INTERNALS.minVufImprovementPct);

const headroomRatio = computed(() => {
  const ratios = [];
  const pMax = policyNumber('siteMaxTotalPowerW', 0);
  if (pMax > 0 && Number.isFinite(props.measuredTotalPowerW)) ratios.push(props.measuredTotalPowerW / pMax);
  const iMax = policyNumber('siteMaxPhaseCurrentA', 0);
  if (iMax > 0) {
    for (const value of Object.values(props.measuredCurrents ?? {})) {
      const current = Number(value);
      if (Number.isFinite(current)) ratios.push(current / iMax);
    }
  }
  return ratios.length > 0 ? Math.max(...ratios) : null;
});
const siteLimitGuardEnabled = computed(() => headroomRatio.value !== null);
const batteryRamp = reactive({
  active: false,
  startedAt: 0,
  lastSampleToken: null,
  lastCurrentA: null,
  stableCount: 0,
  stableReady: false,
  hardOverrideAttempted: false,
});

const batteryEffective = computed(() => {
  if (normalizedDeviceStates.value.batteryCharging !== true) return true;
  // Do not classify a charger as ineffective while its current is still ramping.
  if (batteryRamp.active) return true;
  const current = Number(props.batteryMeasuredCurrentA);
  return !Number.isFinite(current) || current >= batteryEffectiveMinA.value;
});

const awaitingAiExecution = ref(false);
const aiActionDevice = ref(null);
const aiBatteryTurnOnExpected = ref(false);
const resumeBatteryRampAfterAction = ref(false);
const imbalanceLatched = ref(false);

/*
 * Device segments show either the last ESP32-confirmed state or an outstanding
 * command target. A prediction alone must never overwrite the visible device
 * state because it has not necessarily been sent to the backend.
 *
 * Pending state deliberately survives AI CONTROL ON/OFF. It is cleared only
 * when the matching execution status arrives (see the watcher below), or when
 * a later command replaces the target through markPending().
 */
const mergedPendingState = computed(() => {
  const actual = normalizedDeviceStates.value;
  return {
    heatpump: pendingDevices.heatpump ? pendingTargetState.heatpump : actual.heatpump,
    wallbox: pendingDevices.wallbox ? pendingTargetState.wallbox : actual.wallbox,
    batteryCharging: pendingDevices.batteryCharging ? pendingTargetState.batteryCharging : actual.batteryCharging,
  };
});

const displayedState = computed(() => mergedPendingState.value);
const decisionStateTitle = computed(() => {
  if (hasPendingDevice.value) return 'Pending device state';
  if (prediction.value) return 'Selected device state';
  return 'Current device state';
});

const formatDeviceLevel = value => value === null ? '--' : String(value);
const formatBinary = value => value === null ? '--' : (value ? 'ON' : 'OFF');

const feedbackText = value => {
  if (!value) return '--';
  if (typeof value === 'string') return value;
  const status = value.ack_status ?? value.status ?? value.state ?? value.reason_code ?? value.reason ?? value.payload;
  return status === undefined || status === null ? 'received' : String(status);
};

const latestFeedbackLines = computed(() => {
  const branchA = props.commandFeedback?.branchA ?? {};
  const branchB = props.commandFeedback?.branchB ?? {};
  return {
    branchA: `ACK: ${feedbackText(branchA.ack)} · STATUS: ${feedbackText(branchA.status)}`,
    branchB: `ACK: ${feedbackText(branchB.ack)} · STATUS: ${feedbackText(branchB.status)}`,
  };
});

const clearPending = key => {
  pendingDevices[key] = false;
  pendingTargetState[key] = null;
  if (key === 'heatpump') pendingHeatpumpMode.value = null;
};

const markPending = (patch, { heatpumpMode = null } = {}) => {
  const current = normalizedDeviceStates.value;
  for (const key of Object.keys(pendingDevices)) {
    if (!Object.hasOwn(patch, key)) continue;

    const levelChanged = patch[key] !== current[key];
    const modeChanged = key === 'heatpump' && heatpumpMode !== null && heatpumpMode !== normalizedHeatpumpMode.value;
    pendingDevices[key] = levelChanged || modeChanged;
    pendingTargetState[key] = pendingDevices[key] ? patch[key] : null;
    if (key === 'heatpump') pendingHeatpumpMode.value = pendingDevices[key] ? heatpumpMode : null;
  }
};

watch([normalizedDeviceStates, normalizedHeatpumpMode], ([current, heatpumpMode]) => {
  for (const key of Object.keys(pendingDevices)) {
    if (!pendingDevices[key]) continue;

    const levelMatches = current[key] === pendingTargetState[key];
    const modeMatches = key !== 'heatpump' || pendingHeatpumpMode.value === null || heatpumpMode === pendingHeatpumpMode.value;
    if (levelMatches && modeMatches) clearPending(key);
  }
}, { deep: true });

const resetBatteryRamp = () => {
  batteryRamp.active = false;
  batteryRamp.startedAt = 0;
  batteryRamp.lastSampleToken = null;
  batteryRamp.lastCurrentA = null;
  batteryRamp.stableCount = 0;
  batteryRamp.stableReady = false;
  batteryRamp.hardOverrideAttempted = false;
};

const startBatteryRamp = () => {
  resetBatteryRamp();
  batteryRamp.active = true;
  batteryRamp.startedAt = Date.now();
  agentState.value = 'battery_ramping';
  cooldownUntil.value = 0;
  addLog(
    'Battery ON confirmed · ramp monitoring',
    `Live Battery current/P+Q now drives current-state VUF. Normal AI optimization waits for ≥${(BATTERY_CONTROL_INTERNALS.batteryMinSettleMs / 1000).toFixed(1)} s and ${BATTERY_CONTROL_INTERNALS.batteryStableSamples} stable current updates (ΔI ≤ ${BATTERY_CONTROL_INTERNALS.batteryStableDeltaA.toFixed(2)} A), with a ${(BATTERY_CONTROL_INTERNALS.batteryMaxSettleMs / 1000).toFixed(1)} s maximum.`,
    'monitoring'
  );
};

const finishBatteryRamp = reason => {
  if (!batteryRamp.active) return;
  const current = Number(props.batteryMeasuredCurrentA);
  const elapsed = Math.max(0, Date.now() - batteryRamp.startedAt);
  resetBatteryRamp();
  agentState.value = 'adjusting';
  cooldownUntil.value = Date.now();
  const currentText = Number.isFinite(current) ? `${current.toFixed(2)} A` : 'unknown current';
  addLog(
    reason === 'stable' ? 'Battery current stabilized' : 'Battery stabilization timeout',
    reason === 'stable'
      ? `${currentText} after ${(elapsed / 1000).toFixed(1)} s. Normal AI optimization may resume.`
      : `No stable-current confirmation within ${(BATTERY_CONTROL_INTERNALS.batteryMaxSettleMs / 1000).toFixed(1)} s. Continue with the latest measured Battery state (${currentText}) and low stabilization confidence.`,
    reason === 'stable' ? 'success' : 'warning'
  );
};

const maybeFinishStableBatteryRamp = () => {
  if (!batteryRamp.active || hasPendingDevice.value) return;
  const elapsed = Date.now() - batteryRamp.startedAt;
  if (elapsed < BATTERY_CONTROL_INTERNALS.batteryMinSettleMs) return;
  if (batteryRamp.stableReady || batteryRamp.stableCount >= BATTERY_CONTROL_INTERNALS.batteryStableSamples) finishBatteryRamp('stable');
};

watch(hasPendingDevice, (pending, previous) => {
  if (!autoEnabled.value || !awaitingAiExecution.value) return;
  if (previous === true && pending === false) {
    awaitingAiExecution.value = false;

    if (aiActionDevice.value === 'batteryCharging' && aiBatteryTurnOnExpected.value && normalizedDeviceStates.value.batteryCharging === true) {
      aiBatteryTurnOnExpected.value = false;
      startBatteryRamp();
      return;
    }

    if (resumeBatteryRampAfterAction.value && normalizedDeviceStates.value.batteryCharging === true) {
      resumeBatteryRampAfterAction.value = false;
      agentState.value = 'battery_ramping';
      addLog('Headroom override confirmed · Battery ramp continues', 'The safety/headroom action is complete. Battery stabilization monitoring continues from live current samples.', 'monitoring');
      maybeFinishStableBatteryRamp();
      return;
    }

    aiBatteryTurnOnExpected.value = false;
    agentState.value = 'adjusting';
    cooldownUntil.value = Date.now() + activeSettleMs.value;
    addLog('Execution confirmed · settling', `${aiActionDevice.value ?? 'device'} confirmed. Waiting ${(activeSettleMs.value / 1000).toFixed(1)} s before the next control decision.`, 'monitoring');
  }
});

watch(() => props.batteryMeasurementToken, token => {
  if (!batteryRamp.active || token === null || token === undefined || token === batteryRamp.lastSampleToken) return;
  batteryRamp.lastSampleToken = token;

  const current = Number(props.batteryMeasuredCurrentA);
  if (!Number.isFinite(current)) return;

  const elapsed = Date.now() - batteryRamp.startedAt;
  if (batteryRamp.lastCurrentA !== null) {
    const delta = Math.abs(current - batteryRamp.lastCurrentA);
    if (elapsed >= BATTERY_CONTROL_INTERNALS.batteryMinSettleMs && delta <= BATTERY_CONTROL_INTERNALS.batteryStableDeltaA) {
      batteryRamp.stableCount += 1;
    } else {
      batteryRamp.stableCount = 0;
    }
  }
  batteryRamp.lastCurrentA = current;
  batteryRamp.stableReady = batteryRamp.stableCount >= BATTERY_CONTROL_INTERNALS.batteryStableSamples;
  maybeFinishStableBatteryRamp();
});

watch(() => normalizedDeviceStates.value.batteryCharging, charging => {
  if (charging === false && batteryRamp.active) {
    resetBatteryRamp();
    if (autoEnabled.value && !hasPendingDevice.value) agentState.value = 'monitoring';
  }
});

const conditionForVuf = value => classifyVuf(value);

const condition = computed(() => conditionForVuf(props.vuf));
const vuf = computed(() => props.vuf);

const cooldownRemaining = computed(() => Math.max(0, (cooldownUntil.value - now.value) / 1000));
const activeSettleMs = computed(() => {
  if (aiActionDevice.value === 'heatpump') return BATTERY_CONTROL_INTERNALS.heatpumpSettleMs;
  if (aiActionDevice.value === 'wallbox') return BATTERY_CONTROL_INTERNALS.wallboxSettleMs;
  if (aiActionDevice.value === 'batteryCharging') return BATTERY_CONTROL_INTERNALS.batteryMinSettleMs;
  return BATTERY_CONTROL_INTERNALS.heatpumpSettleMs;
});
const cooldownProgress = computed(() => {
  const seconds = Math.max(0.001, activeSettleMs.value / 1000);
  return 100 - Math.min(100, (cooldownRemaining.value / seconds) * 100);
});
const batteryRampElapsedS = computed(() => batteryRamp.active ? Math.max(0, now.value - batteryRamp.startedAt) / 1000 : 0);
const batteryRampProgress = computed(() => Math.min(100, (batteryRampElapsedS.value * 1000 / BATTERY_CONTROL_INTERNALS.batteryMaxSettleMs) * 100));

const formatVuf = value => formatVufPercent(value);

const addLog = async (title, message, type = 'info') => {
  const entry = {
    id: ++logId.value,
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    title,
    message,
    type,
  };
  logs.value.unshift(entry);
  logs.value = logs.value.slice(0, 40);
  await nextTick();
  if (logContainer.value) logContainer.value.scrollTop = 0;
};

const agentStateDescription = computed(() => {
  if (!autoEnabled.value) return 'Automatic control is disabled.';
  if (agentState.value === 'blocked') return props.controlBlockedReason || 'Automatic control is blocked by hardware/data gate.';
  if (agentState.value === 'pending') return 'A control command is waiting for physical execution feedback.';
  if (agentState.value === 'battery_ramping') return 'Battery is ON and ramping. Current-state VUF follows live Battery current/P+Q; normal optimization is paused unless a hard site limit is reached.';
  if (agentState.value === 'adjusting') return 'Execution confirmed. Waiting for the deterministic post-action settling window.';
  return 'Battery-priority VUF control is monitoring raw model-estimated VUF. CUF/load-unbalance control is intentionally deferred.';
});

const predictCandidate = async state => {
  const predictionResult = await props.predictVuf(state);
  if (predictionResult === null || predictionResult === undefined) return null;

  // Backward-compatible numeric predictor support plus the v1.5 rich result
  // { vuf, voltageSafe, voltages }. VUF is still the primary optimization KPI;
  // the voltage window is a hard feasibility constraint, not a second score.
  if (typeof predictionResult === 'number') {
    return Number.isFinite(predictionResult)
      ? { state, vuf: predictionResult, voltageSafe: true, voltages: null }
      : null;
  }

  const numeric = Number(predictionResult.vuf);
  if (!Number.isFinite(numeric)) return null;
  return {
    state,
    vuf: numeric,
    voltageSafe: predictionResult.voltageSafe !== false,
    voltages: predictionResult.voltages ?? null,
  };
};

const getReductionCandidates = current => {
  const candidates = [];
  if (current.heatpump > 0) {
    const nextHeatpump = current.heatpump - 1;
    if (nextHeatpump / MAX_HEATPUMP >= MIN_LOAD_RATIO) candidates.push({ ...current, heatpump: nextHeatpump });
  }

  // Wallbox is a 2-bit relay mask, not a linear level.
  if ((current.wallbox & 1) !== 0) candidates.push({ ...current, wallbox: current.wallbox & ~1 });
  if ((current.wallbox & 2) !== 0) candidates.push({ ...current, wallbox: current.wallbox & ~2 });

  if (current.batteryCharging) candidates.push({ ...current, batteryCharging: false });
  return candidates;
};

const getCompensationCandidates = current => {
  const candidates = [];
  if (current.heatpump === 0) candidates.push({ ...current, heatpump: 1 });
  if ((current.wallbox & 1) === 0) candidates.push({ ...current, wallbox: current.wallbox | 1 });
  if ((current.wallbox & 2) === 0) candidates.push({ ...current, wallbox: current.wallbox | 2 });
  if (!current.batteryCharging) candidates.push({ ...current, batteryCharging: true });
  return candidates;
};


const actionDelta = (current, candidate) => {
  const keys = ['heatpump', 'wallbox', 'batteryCharging'];
  const changed = keys.filter(key => candidate[key] !== current[key]);
  return changed.length === 1 ? changed[0] : null;
};

const prototypeCurrentFor = (key, value) => {
  if (key === 'heatpump') return PROTOTYPE_CURRENT_CURVES_A.heatpump[value] ?? 0;
  if (key === 'wallbox') return PROTOTYPE_CURRENT_CURVES_A.wallbox[value] ?? 0;
  if (key === 'batteryCharging') {
    if (!value) return 0;
    const current = Number(props.batteryMeasuredCurrentA);
    return Number.isFinite(current) ? Math.max(0, current) : 0;
  }
  return 0;
};

const prototypeReliefA = (current, candidate) => {
  let relief = 0;
  for (const key of ['heatpump', 'wallbox', 'batteryCharging']) {
    relief += prototypeCurrentFor(key, current[key]) - prototypeCurrentFor(key, candidate[key]);
  }
  return relief;
};

const dedupeStates = candidates => {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
};

const evaluateCandidates = async candidates => {
  const results = [];
  for (const candidate of candidates) {
    const result = await predictCandidate(candidate);
    if (!result) continue;
    if (!result.voltageSafe) {
      const values = result.voltages
        ? Object.values(result.voltages).filter(Number.isFinite).map(v => `${v.toFixed(1)} V`).join('/')
        : 'unknown voltages';
      addLog('Candidate rejected by voltage guard', `Predicted VUF ${formatVuf(result.vuf)} but phase voltage would leave 207–253 V (${values}).`, 'warning');
      continue;
    }
    results.push(result);
  }
  if (results.length === 0) return null;
  results.sort((a, b) => a.vuf - b.vuf);
  return results[0];
};

const chooseNextAction = async () => {
  if (hasUnknownDeviceState.value) return null;
  const current = { ...normalizedDeviceStates.value };
  const currentVuf = Number(props.vuf);
  if (!Number.isFinite(currentVuf)) return null;

  const evaluateBest = async candidates => {
    const best = await evaluateCandidates(dedupeStates(candidates));
    if (!best || best.vuf >= currentVuf - minImprovement.value) return null;
    return best;
  };

  // 1) Hard/pre-limit protection has precedence over balancing preference.
  //    If Battery is already ON and site headroom approaches the configured
  //    limit, first derate Heatpump or Wallbox by one permitted step.
  if (siteLimitGuardEnabled.value && normalizedDeviceStates.value.batteryCharging === true && headroomRatio.value >= preLimitRatio.value) {
    const derating = getReductionCandidates(current).filter(candidate => {
      const key = actionDelta(current, candidate);
      return key === 'heatpump' || key === 'wallbox';
    });
    const evaluated = [];
    for (const candidate of derating) {
      const result = await predictCandidate(candidate);
      if (result?.voltageSafe) evaluated.push({ ...result, reliefA: prototypeReliefA(current, candidate) });
    }
    if (evaluated.length > 0) {
      // Primary in headroom mode: release as much prototype current as possible;
      // VUF is the tie-breaker. This uses the measured A/B current curves.
      evaluated.sort((a, b) => (b.reliefA - a.reliefA) || (a.vuf - b.vuf));
      return { ...evaluated[0], reason: 'headroom_derating' };
    }

    // No HP/WB derating exists. At/above the hard threshold Battery OFF becomes
    // a last-resort load-reduction action; below hard threshold keep monitoring.
    if (headroomRatio.value >= hardRatio.value && current.batteryCharging) {
      const off = await predictCandidate({ ...current, batteryCharging: false });
      if (off?.voltageSafe) return { ...off, reason: 'hard_limit_battery_off' };
    }
  }

  // 2) Battery-first balancing: when Battery is OFF and the site is not already
  //    close to a configured headroom limit, try exactly this action first.
  if (!current.batteryCharging && (!siteLimitGuardEnabled.value || headroomRatio.value < preLimitRatio.value)) {
    const batteryCandidate = await predictCandidate({ ...current, batteryCharging: true });
    if (batteryCandidate?.voltageSafe && batteryCandidate.vuf < currentVuf - minImprovement.value) {
      return { ...batteryCandidate, reason: 'battery_priority' };
    }
  }

  // 3) If the Battery is ON but has tapered below the configured effective
  //    current, do not treat it as a useful balancing actuator. Choose among
  //    the remaining one-step Heatpump/Wallbox actions.
  const allCandidates = [
    ...getReductionCandidates(current),
    ...getCompensationCandidates(current),
  ].filter(candidate => {
    const key = actionDelta(current, candidate);
    if (!batteryEffective.value && key === 'batteryCharging') return false;
    return true;
  });

  const best = await evaluateBest(allCandidates);
  return best ? { ...best, reason: batteryEffective.value ? 'optimize_after_battery' : 'battery_ineffective_fallback' } : null;
};

const selectAndApplyState = async (repeatedViolation, { fromBatteryRampHardOverride = false } = {}) => {
  if (!autoEnabled.value || evaluating.value) return;
  if (!props.controlReady) {
    agentState.value = 'blocked';
    prediction.value = null;
    return;
  }

  evaluating.value = true;
  try {
    addLog(repeatedViolation ? 'VUF still violated' : 'VUF violation detected', `Raw estimated VUF is ${Number(props.vuf).toFixed(3)}%.`, 'critical');
    const action = await chooseNextAction();
    if (!autoEnabled.value) return;
    if (!action) {
      prediction.value = null;
      if (fromBatteryRampHardOverride && batteryRamp.active) {
        agentState.value = 'battery_ramping';
        addLog('No hard-limit derating action available', 'Battery ramp monitoring continues; no voltage-safe Heatpump/Wallbox derating candidate was available.', 'warning');
      } else {
        agentState.value = 'monitoring';
        addLog('No permitted adjustment found', 'No voltage-safe one-step reduction or compensation action is predicted to improve VUF.', 'warning');
      }
      return;
    }

    prediction.value = action;
    const current = normalizedDeviceStates.value;
    const patch = {};
    for (const key of ['heatpump', 'wallbox', 'batteryCharging']) {
      if (action.state[key] !== current[key]) patch[key] = action.state[key];
    }
    if (Object.keys(patch).length === 0) return;
    aiBatteryTurnOnExpected.value = Object.hasOwn(patch, 'batteryCharging') && patch.batteryCharging === true;
    const batteryOffOverride = Object.hasOwn(patch, 'batteryCharging') && patch.batteryCharging === false;
    if (fromBatteryRampHardOverride && batteryRamp.active && !batteryOffOverride) resumeBatteryRampAfterAction.value = true;
    if (batteryOffOverride) {
      resetBatteryRamp();
      resumeBatteryRampAfterAction.value = false;
    }
    markPending(patch, { heatpumpMode: Object.hasOwn(patch, 'heatpump') ? (patch.heatpump === 0 ? 'zero_hold' : 'start') : null });
    aiActionDevice.value = Object.keys(patch)[0] ?? null;
    awaitingAiExecution.value = true;
    emit('apply-state', patch);
    addLog(
      action.reason === 'battery_priority' ? 'Battery-priority action selected' : action.reason === 'headroom_derating' ? 'Headroom derating selected' : 'Best one-step balancing action selected',
      [`Heat pump ${action.state.heatpump}/5`, `Wallbox ${action.state.wallbox}/3`, `Battery ${action.state.batteryCharging ? 'ON' : 'OFF'}`, `Predicted VUF ${formatVuf(action.vuf)}`, 'Voltage guard 207–253 V: OK'].join(' · '),
      'action'
    );
    agentState.value = 'pending';
    cooldownUntil.value = 0;
  } finally {
    evaluating.value = false;
  }
};

const evaluateAgent = async () => {
  now.value = Date.now();
  if (!autoEnabled.value || evaluating.value) return;
  if (!props.controlReady) {
    agentState.value = 'blocked';
    prediction.value = null;
    return;
  }
  if (hasPendingDevice.value) {
    // Site hard-limit protection must not be blocked by an in-flight Battery
    // ON request. If the measured site load reaches 100% while Battery start
    // is still pending, immediately send an OFF override for Battery.
    if (
      pendingDevices.batteryCharging &&
      pendingTargetState.batteryCharging === true &&
      siteLimitGuardEnabled.value &&
      headroomRatio.value !== null &&
      headroomRatio.value >= hardRatio.value
    ) {
      aiBatteryTurnOnExpected.value = false;
      resumeBatteryRampAfterAction.value = false;
      resetBatteryRamp();
      pendingTargetState.batteryCharging = false;
      emit('apply-state', { batteryCharging: false });
      prediction.value = null;
      addLog('Battery start aborted by hard site limit', `Headroom ratio ${(headroomRatio.value * 100).toFixed(1)}% reached the 100% hard limit before Battery start completed. Battery OFF override sent.`, 'critical');
      if (normalizedDeviceStates.value.batteryCharging === false) {
        clearPending('batteryCharging');
        awaitingAiExecution.value = false;
        aiActionDevice.value = 'batteryCharging';
        agentState.value = 'adjusting';
        cooldownUntil.value = Date.now() + BATTERY_CONTROL_INTERNALS.batteryMinSettleMs;
        return;
      }
    }
    agentState.value = 'pending';
    return;
  }
  if (props.vuf === null || props.vuf === undefined || props.vuf === '' || hasUnknownDeviceState.value) {
    agentState.value = 'monitoring';
    prediction.value = null;
    return;
  }

  const rawVuf = Number(props.vuf);
  if (!Number.isFinite(rawVuf)) return;

  if (rawVuf > vufEnterPct.value) imbalanceLatched.value = true;
  else if (rawVuf < vufExitPct.value) imbalanceLatched.value = false;

  if (agentState.value === 'battery_ramping') {
    const elapsed = now.value - batteryRamp.startedAt;

    // Normal optimization waits for real current stabilization. Hard site
    // limits remain active and may interrupt the ramp with immediate HP/WB
    // derating (or Battery OFF as last resort).
    if (siteLimitGuardEnabled.value && headroomRatio.value >= hardRatio.value) {
      if (!batteryRamp.hardOverrideAttempted) {
        batteryRamp.hardOverrideAttempted = true;
        addLog('Hard site limit during Battery ramp', `Headroom ratio ${(headroomRatio.value * 100).toFixed(1)}% reached the 100% hard limit. Normal ramp waiting is overridden.`, 'critical');
        await selectAndApplyState(true, { fromBatteryRampHardOverride: true });
      }
      return;
    }
    batteryRamp.hardOverrideAttempted = false;

    if (elapsed >= BATTERY_CONTROL_INTERNALS.batteryMaxSettleMs) {
      finishBatteryRamp('timeout');
      return;
    }
    maybeFinishStableBatteryRamp();
    return;
  }

  if (agentState.value === 'adjusting') {
    if (now.value < cooldownUntil.value) return;
    if (imbalanceLatched.value) { await selectAndApplyState(true); return; }
    prediction.value = null;
    agentState.value = 'monitoring';
    addLog('VUF stabilized', `Raw estimated VUF ${rawVuf.toFixed(3)}% is below the release threshold ${vufExitPct.value.toFixed(2)}%.`, 'success');
    return;
  }

  agentState.value = 'monitoring';
  if (imbalanceLatched.value) await selectAndApplyState(false);
};

const toggleAuto = () => {
  if (!props.controlReady) return;
  autoEnabled.value = !autoEnabled.value;
  emit('enabled-change', autoEnabled.value);
  prediction.value = null;
  cooldownUntil.value = 0;
  if (!autoEnabled.value) {
    resetBatteryRamp();
    aiBatteryTurnOnExpected.value = false;
    resumeBatteryRampAfterAction.value = false;
  }

  if (autoEnabled.value) {
    agentState.value = 'monitoring';
    addLog(
      'Monitoring started',
      hasPendingDevice.value
        ? 'Automatic VUF control enabled. Existing pending command remains visible until execution feedback confirms it.'
        : 'Automatic VUF control enabled.',
      'monitoring'
    );
    evaluateAgent();
    return;
  }
  agentState.value = 'inactive';
  addLog(
    'Agent inactive',
    hasPendingDevice.value
      ? 'Automatic VUF control disabled. Existing pending command remains visible until execution feedback confirms it.'
      : 'Automatic VUF control disabled.',
    'inactive'
  );
};

watch(() => props.vuf, () => {
  if (autoEnabled.value && ['monitoring', 'blocked'].includes(agentState.value)) evaluateAgent();
});

watch(() => props.controlReady, ready => {
  if (!autoEnabled.value) return;
  if (ready && agentState.value === 'blocked') evaluateAgent();
  if (!ready) {
    agentState.value = 'blocked';
    prediction.value = null;
  }
});

const setDeviceState = (device, value) => {
  if (!props.controlReady) return;
  prediction.value = null;
  let patch = null;

  if (device === 'heatpump') patch = { heatpump: clampInt(value, 0, MAX_HEATPUMP) };
  if (device === 'wallbox') patch = { wallbox: clampInt(value, 0, MAX_WALLBOX) };
  if (device === 'batteryCharging') patch = { batteryCharging: value === true };
  if (!patch) return;

  markPending(patch, { heatpumpMode: device === 'heatpump' ? (patch.heatpump === 0 ? 'zero_hold' : 'start') : null });
  emit('apply-state', patch);

  const nextState = { ...displayedState.value, ...patch };
  addLog('Manual device state changed', [`Heat pump ${formatDeviceLevel(nextState.heatpump)}/5`, `Wallbox ${formatDeviceLevel(nextState.wallbox)}/3`, `Battery ${formatBinary(nextState.batteryCharging)}`].join(' · '), 'info');
};

const requestHeatpumpStop = () => {
  if (!props.controlReady) return;
  prediction.value = null;
  const patch = { heatpump: 0 };
  markPending(patch, { heatpumpMode: 'stop' });
  emit('heatpump-stop');
  addLog('Heat pump STOP requested', 'Manual STOP sends Branch-A stop,0 and stays distinct from ZERO_HOLD.', 'info');
};

const requestHeatpumpZeroHold = () => {
  if (!props.controlReady) return;
  prediction.value = null;
  const patch = { heatpump: 0 };
  markPending(patch, { heatpumpMode: 'zero_hold' });
  emit('heatpump-zero-hold');
  addLog('Heat pump ZERO_HOLD requested', 'Manual ZERO_HOLD uses Branch-A start,0 and is intentionally different from STOP.', 'info');
};

onMounted(() => { timer.value = window.setInterval(evaluateAgent, TICK_MS); });
onUnmounted(() => { if (timer.value) window.clearInterval(timer.value); });
</script>

<style scoped>
.agent-card{--text:#eaf6ff;--muted:#83a7bd;--cyan:#58e7ff;--green:#42e38c;--yellow:#ffd166;--red:#ff5c6c;padding:18px;color:var(--text);border:1px solid #163448;border-radius:20px;background:linear-gradient(180deg,rgba(12,30,44,.96),rgba(6,18,28,.96));box-shadow:0 20px 60px rgba(0,0,0,.34)}.header,.section-head,.condition,.device-head,.cooldown-label{display:flex;align-items:center}.header,.section-head,.device-head,.cooldown-label{justify-content:space-between}.header{align-items:flex-start;gap:16px}.eyebrow,.panel-label{color:#6f9ab1;font-size:10px;letter-spacing:.14em;text-transform:uppercase}h2,h3{margin:4px 0 0}h2{font-size:18px}h3{font-size:14px}.control-toggle{display:flex;align-items:center;gap:11px;padding:10px 13px;border:1px solid #294d62;border-radius:14px;color:#9cb8c9;background:#081721;cursor:pointer}.control-toggle.enabled{border-color:rgba(66,227,140,.55);color:#eafff4;background:rgba(21,75,59,.35)}.control-toggle:disabled,.off-button:disabled,.binary:disabled{cursor:not-allowed;opacity:.45}.control-toggle strong,.control-toggle small{display:block}.control-toggle strong{font-size:11px}.control-toggle small{margin-top:2px;color:#6f91a3;font-size:9px}.toggle-track{position:relative;width:42px;height:24px;border:1px solid #315369;border-radius:999px;background:#0b1a25}.toggle-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#6f91a3;transition:left .2s ease,background .2s ease}.enabled .toggle-knob{left:21px;background:var(--green)}.status-grid,.devices{display:grid;gap:10px}.status-grid{grid-template-columns:1fr 1fr;margin-top:16px}.devices{grid-template-columns:repeat(3,1fr)}.feedback-lines{display:grid;gap:3px;margin-top:8px;color:#6f91a3;font-size:9px}.panel,.device{padding:13px;border:1px solid #17384b;border-radius:14px;background:#081721}.device.pending{border-color:#ffd166;box-shadow:0 0 0 1px rgba(255,209,102,.25),0 0 20px rgba(255,209,102,.08)}.device.unknown{border-style:dashed;opacity:.88}.condition{gap:8px;margin-top:10px}.dot,.log-dot{width:8px;height:8px;border-radius:50%;background:#698a9c}.balanced,.success{color:var(--green)}.warning{color:var(--yellow)}.critical{color:var(--red)}.unknown{color:#789aac}.dot.balanced,.log-dot.success,.log-dot.monitoring{background:var(--green)}.dot.warning,.log-dot.warning{background:var(--yellow)}.dot.critical,.log-dot.critical{background:var(--red)}.dot.pending{background:#ffd166;box-shadow:0 0 12px rgba(255,209,102,.45)}.dot.adjusting,.dot.battery_ramping,.log-dot.action{background:var(--cyan)}.dot.inactive,.log-dot.inactive,.dot.blocked{background:#698a9c}.vuf-value{margin-top:10px;font-size:30px;font-weight:900}.vuf-prediction{margin-left:8px;color:var(--yellow);font-size:16px}.thresholds,.panel p{color:#6f91a3;font-size:9px}.section-head{margin:18px 0 10px}.decision-badges{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}.badge{padding:5px 8px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.pending-badge,.pending-note{color:#ffd166}.pending-note{display:block;margin:-4px 0 8px;font-size:10px;letter-spacing:.03em}.device-value{font-size:26px;font-weight:900}.device-value small{font-size:12px;color:#83a7bd}.segments{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px}.segments.three{grid-template-columns:repeat(3,1fr)}.level-button{height:8px;border:0;border-radius:999px;background:#143042;cursor:pointer}.level-button.active{background:var(--cyan);box-shadow:0 0 10px rgba(88,231,255,.45)}.level-button:disabled{cursor:not-allowed;opacity:.5}.off-button{margin-top:8px;margin-right:5px;padding:5px 8px;border:1px solid #285369;border-radius:7px;background:#0b2635;color:#dff7ff;cursor:pointer;font-size:10px}.off-button.active{border-color:#58e7ff;color:#58e7ff}.zero-hold-button{border-color:#365b70}.binary{margin-top:10px;padding:7px 12px;border:1px solid #284b60;border-radius:999px;background:#eaf6ff;color:#0b1a27;font-weight:800}.binary.on{background:#154b3b;color:#8ff1c3;border-color:#42e38c}.clickable{cursor:pointer}.cooldown{margin-top:12px}.cooldown-track{height:6px;border-radius:999px;background:#102b3b;overflow:hidden}.cooldown-fill{height:100%;background:var(--cyan)}.log{max-height:160px;overflow:auto}.log-entry{display:grid;grid-template-columns:70px 12px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid #123042;font-size:11px}.log time,.log p,.empty{color:#6f91a3}.log p{margin:2px 0 0}.empty{text-align:center;padding:20px}@media(max-width:760px){.status-grid,.devices{grid-template-columns:1fr}.header{flex-direction:column}}
</style>
