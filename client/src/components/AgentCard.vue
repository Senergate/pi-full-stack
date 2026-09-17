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
          <small>{{ autoEnabled ? 'Battery-priority VUF control · HP/WB downshift-only · voltage/headroom guards' : 'Operator control' }}</small>
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
        <div class="vuf-value" :class="{ 'critical-unresolved-blink': agentState === 'critical_unresolved' }">
          <span>{{ formatVuf(vuf) }}</span>
          <span v-if="['pending','adjusting'].includes(agentState) && prediction" class="vuf-prediction">({{ formatVuf(prediction.vuf) }})</span>
        </div>
        <div class="thresholds">Control enter {{ vufEnterPct.toFixed(1) }}% · release {{ vufExitPct.toFixed(1) }}% · Battery effective ≥ {{ batteryEffectiveMinA.toFixed(2) }} A</div>
        <div class="thresholds">HP min {{ heatpumpLocked ? 'LOCKED' : `L${heatpumpMinAllowedLevel}` }} · WB min {{ wallboxLocked ? 'LOCKED' : `L${wallboxMinAllowedLevel}` }} · Capacity {{ headroomRatio !== null ? `${(headroomRatio * 100).toFixed(1)}%` : 'OFF' }}</div>
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
import { CONTROL_POLICY_DEFAULTS, PROTOTYPE_CURRENT_CURVES_A } from '../ControlPolicyConfig.js';
import { heatpumpAdjustabilityRule, phaseCurrentLimitA, wallboxAdjustabilityRule } from '../CapacitySupervisor.js';

const TICK_MS = 250;
const MAX_HEATPUMP = 5;
const MAX_WALLBOX = 3;

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
});

const emit = defineEmits(['apply-state', 'enabled-change', 'heatpump-zero-hold', 'heatpump-stop', 'state-change']);

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
const preLimitRatio = computed(() => policyNumber('preLimitRatio', CONTROL_POLICY_DEFAULTS.preLimitRatio));
const criticalRatio = computed(() => policyNumber('criticalRatio', CONTROL_POLICY_DEFAULTS.criticalRatio));
const hardRatio = computed(() => policyNumber('hardRatio', CONTROL_POLICY_DEFAULTS.hardRatio));
const minImprovement = computed(() => policyNumber('minVufImprovementPct', CONTROL_POLICY_DEFAULTS.minVufImprovementPct));

const heatpumpAdjustabilityState = computed(() =>
  heatpumpAdjustabilityRule(policyNumber('heatpumpAdjustability', CONTROL_POLICY_DEFAULTS.heatpumpAdjustability))
);
const wallboxAdjustabilityState = computed(() =>
  wallboxAdjustabilityRule(policyNumber('wallboxAdjustability', CONTROL_POLICY_DEFAULTS.wallboxAdjustability))
);
const heatpumpAdjustability = computed(() => heatpumpAdjustabilityState.value.percent);
const wallboxAdjustability = computed(() => wallboxAdjustabilityState.value.percent);
const heatpumpLocked = computed(() => heatpumpAdjustabilityState.value.locked);
const wallboxLocked = computed(() => wallboxAdjustabilityState.value.locked);
const heatpumpMinAllowedLevel = computed(() => heatpumpAdjustabilityState.value.minLevel);
const wallboxMinAllowedLevel = computed(() => wallboxAdjustabilityState.value.minLevel);

const headroomRatio = computed(() => {
  const ratios = [];
  const pMax = policyNumber('siteMaxTotalPowerW', 0);
  if (pMax > 0 && Number.isFinite(props.measuredTotalPowerW)) ratios.push(props.measuredTotalPowerW / pMax);
  for (const phase of ['a', 'b', 'c']) {
    const limit = phaseCurrentLimitA(props.controlPolicy, phase);
    const current = Number(props.measuredCurrents?.[phase]);
    if (limit > 0 && Number.isFinite(current)) ratios.push(current / limit);
  }
  return ratios.length > 0 ? Math.max(...ratios) : null;
});
const siteLimitGuardEnabled = computed(() => headroomRatio.value !== null);
const batteryEffective = computed(() => {
  if (normalizedDeviceStates.value.batteryCharging !== true) return true;
  const current = Number(props.batteryMeasuredCurrentA);
  return !Number.isFinite(current) || current >= batteryEffectiveMinA.value;
});

const awaitingAiExecution = ref(false);
const aiActionDevice = ref(null);
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

watch(hasPendingDevice, (pending, previous) => {
  if (!autoEnabled.value || !awaitingAiExecution.value) return;
  if (previous === true && pending === false) {
    awaitingAiExecution.value = false;
    agentState.value = 'adjusting';
    cooldownUntil.value = Date.now() + activeSettleMs.value;
    addLog('Execution confirmed · settling', `${aiActionDevice.value ?? 'device'} confirmed. Waiting ${(activeSettleMs.value / 1000).toFixed(1)} s before the next control decision.`, 'monitoring');
  }
});

const conditionForVuf = value => classifyVuf(value);

const condition = computed(() => conditionForVuf(props.vuf));
const vuf = computed(() => props.vuf);

const cooldownRemaining = computed(() => Math.max(0, (cooldownUntil.value - now.value) / 1000));
const activeSettleMs = computed(() => {
  if (aiActionDevice.value === 'heatpump') return policyNumber('heatpumpSettleMs', CONTROL_POLICY_DEFAULTS.heatpumpSettleMs);
  if (aiActionDevice.value === 'wallbox') return policyNumber('wallboxSettleMs', CONTROL_POLICY_DEFAULTS.wallboxSettleMs);
  if (aiActionDevice.value === 'batteryCharging') return policyNumber('batterySettleMs', CONTROL_POLICY_DEFAULTS.batterySettleMs);
  return CONTROL_POLICY_DEFAULTS.heatpumpSettleMs;
});
const cooldownProgress = computed(() => {
  const seconds = Math.max(0.001, activeSettleMs.value / 1000);
  return 100 - Math.min(100, (cooldownRemaining.value / seconds) * 100);
});

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
  if (agentState.value === 'adjusting') return 'Execution confirmed. Waiting for the configured post-action settling window.';
  if (agentState.value === 'critical_unresolved') return 'VUF remains critical and no permitted Battery/Heatpump/Wallbox action can resolve it inside the configured adjustability limits.';
  return 'Battery-priority VUF control is monitoring raw model-estimated VUF. CUF/Schieflast control is intentionally deferred.';
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

  // Operator adjustability is a hard optimization boundary for normal AI
  // actions. Heatpump Level 0 remains STOP/ZERO_HOLD semantics and is never
  // reached by ordinary VUF/headroom derating.
  if (!heatpumpLocked.value && heatpumpMinAllowedLevel.value !== null && current.heatpump > heatpumpMinAllowedLevel.value) {
    candidates.push({ ...current, heatpump: current.heatpump - 1 });
  }

  // Wallbox states are still physical relay masks (0..3), but for operator
  // adjustability we use the validated logical load ordering 1 < 2 < 3.
  // Exactly one logical level is reduced per AI cycle.
  if (!wallboxLocked.value && wallboxMinAllowedLevel.value !== null && current.wallbox > wallboxMinAllowedLevel.value) {
    candidates.push({ ...current, wallbox: current.wallbox - 1 });
  }

  if (current.batteryCharging) candidates.push({ ...current, batteryCharging: false });
  return candidates;
};

const getCompensationCandidates = current => {
  // AI_CONTROL_INVARIANT:
  // Heatpump and Wallbox are monotonic non-increasing under automatic control.
  // They may only stay at the current executed level or step DOWN by one level.
  // Automatic upshift/recovery is forbidden. Battery remains the only
  // bidirectional balancing actuator (OFF <-> ON).
  const candidates = [];
  if (!current.batteryCharging) candidates.push({ ...current, batteryCharging: true });
  return candidates;
};

const automaticCandidateRespectsMonotonicRule = (current, candidate) => {
  if (candidate.heatpump > current.heatpump) return false;
  if (candidate.wallbox > current.wallbox) return false;
  return true;
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
    const monotonicCandidates = dedupeStates(candidates).filter(candidate =>
      automaticCandidateRespectsMonotonicRule(current, candidate)
    );
    const best = await evaluateCandidates(monotonicCandidates);
    if (!best || best.vuf >= currentVuf - minImprovement.value) return null;
    return best;
  };

  // 1) Capacity PRE-LIMIT/HARD protection has precedence over balancing
  //    preference, regardless of Battery state. First derate Heatpump or
  //    Wallbox by one operator-permitted step; if those paths are exhausted
  //    and Battery is ON, release Battery charging as the next load reduction.
  if (siteLimitGuardEnabled.value && headroomRatio.value >= preLimitRatio.value) {
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

    // If both operator-limited HP/WB derating paths are exhausted, release the
    // Battery load itself from PRE-LIMIT upward. Capacity protection outranks
    // Battery-priority VUF optimization.
    if (current.batteryCharging) {
      const off = await predictCandidate({ ...current, batteryCharging: false });
      if (off?.voltageSafe) {
        return {
          ...off,
          reason: headroomRatio.value >= hardRatio.value ? 'hard_limit_battery_off' : 'headroom_battery_release',
        };
      }
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

const heatpumpAtAdjustabilityFloor = current =>
  heatpumpLocked.value || heatpumpMinAllowedLevel.value === null || current.heatpump <= heatpumpMinAllowedLevel.value;

const wallboxAtAdjustabilityFloor = current =>
  wallboxLocked.value || wallboxMinAllowedLevel.value === null || current.wallbox <= wallboxMinAllowedLevel.value;

const batteryCanExitCritical = async current => {
  // Battery already ON and VUF is still critical: there is no additional ON
  // action left. When OFF, Battery may only be considered if capacity policy
  // still permits adding load, and the predicted state actually exits the
  // VUF critical-enter boundary.
  if (current.batteryCharging) return false;
  if (siteLimitGuardEnabled.value && headroomRatio.value >= preLimitRatio.value) return false;
  const result = await predictCandidate({ ...current, batteryCharging: true });
  return Boolean(result?.voltageSafe && result.vuf <= vufEnterPct.value);
};

const shouldEnterCriticalUnresolved = async () => {
  const current = { ...normalizedDeviceStates.value };
  if (!heatpumpAtAdjustabilityFloor(current) || !wallboxAtAdjustabilityFloor(current)) return false;
  return !(await batteryCanExitCritical(current));
};

const selectAndApplyState = async repeatedViolation => {
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
      const rawVuf = Number(props.vuf);
      const unresolved = Number.isFinite(rawVuf) && rawVuf > vufEnterPct.value && await shouldEnterCriticalUnresolved();
      if (unresolved) {
        agentState.value = 'critical_unresolved';
        addLog(
          'CRITICAL unresolved',
          `VUF ${rawVuf.toFixed(3)}% remains above ${vufEnterPct.value.toFixed(2)}%. Heatpump and Wallbox reached their configured adjustment floor and Battery cannot exit the critical range.`,
          'critical'
        );
      } else {
        agentState.value = 'monitoring';
        addLog('No permitted adjustment found', 'No voltage-safe permitted one-step action is currently predicted to improve VUF. Heatpump/Wallbox automatic upshift is forbidden.', 'warning');
      }
      return;
    }

    prediction.value = action;
    const current = normalizedDeviceStates.value;

    // Final execution-boundary invariant. Even if a future candidate source is
    // added without the normal candidate filter, automatic control must never
    // increase Heatpump or Wallbox above the currently executed level.
    if (!automaticCandidateRespectsMonotonicRule(current, action.state)) {
      prediction.value = null;
      agentState.value = 'blocked';
      addLog(
        'Automatic upshift blocked',
        'AI attempted to increase Heatpump or Wallbox. The monotonic downshift invariant blocked the command before emit().',
        'critical'
      );
      return;
    }

    const patch = {};
    for (const key of ['heatpump', 'wallbox', 'batteryCharging']) {
      if (action.state[key] !== current[key]) patch[key] = action.state[key];
    }
    if (Object.keys(patch).length === 0) return;
    markPending(patch, { heatpumpMode: Object.hasOwn(patch, 'heatpump') ? (patch.heatpump === 0 ? 'zero_hold' : 'start') : null });
    aiActionDevice.value = Object.keys(patch)[0] ?? null;
    awaitingAiExecution.value = true;
    emit('apply-state', patch);
    addLog(
      action.reason === 'battery_priority'
        ? 'Battery-priority action selected'
        : action.reason === 'headroom_derating'
          ? 'Capacity derating selected'
          : ['headroom_battery_release', 'hard_limit_battery_off'].includes(action.reason)
            ? 'Battery released for capacity protection'
            : 'Best one-step balancing action selected',
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

  if (agentState.value === 'critical_unresolved') {
    if (!imbalanceLatched.value) {
      agentState.value = 'monitoring';
      addLog('Critical state cleared', `Raw estimated VUF ${rawVuf.toFixed(3)}% is below the release threshold ${vufExitPct.value.toFixed(2)}%.`, 'success');
    }
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
  if (!autoEnabled.value) return;
  if (['monitoring', 'blocked', 'critical_unresolved'].includes(agentState.value)) evaluateAgent();
});

const retryCriticalUnresolved = () => {
  if (!autoEnabled.value || agentState.value !== 'critical_unresolved') return;
  agentState.value = 'monitoring';
  evaluateAgent();
};

watch(
  [
    normalizedDeviceStates,
    heatpumpAdjustability,
    wallboxAdjustability,
    batteryEffective,
    headroomRatio,
  ],
  retryCriticalUnresolved,
  { deep: true }
);

watch(agentState, value => emit('state-change', value), { immediate: true });

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
.agent-card{--text:#eaf6ff;--muted:#83a7bd;--cyan:#58e7ff;--green:#42e38c;--yellow:#ffd166;--red:#ff5c6c;padding:18px;color:var(--text);border:1px solid #163448;border-radius:20px;background:linear-gradient(180deg,rgba(12,30,44,.96),rgba(6,18,28,.96));box-shadow:0 20px 60px rgba(0,0,0,.34)}.header,.section-head,.condition,.device-head,.cooldown-label{display:flex;align-items:center}.header,.section-head,.device-head,.cooldown-label{justify-content:space-between}.header{align-items:flex-start;gap:16px}.eyebrow,.panel-label{color:#6f9ab1;font-size:10px;letter-spacing:.14em;text-transform:uppercase}h2,h3{margin:4px 0 0}h2{font-size:18px}h3{font-size:14px}.control-toggle{display:flex;align-items:center;gap:11px;padding:10px 13px;border:1px solid #294d62;border-radius:14px;color:#9cb8c9;background:#081721;cursor:pointer}.control-toggle.enabled{border-color:rgba(66,227,140,.55);color:#eafff4;background:rgba(21,75,59,.35)}.control-toggle:disabled,.off-button:disabled,.binary:disabled{cursor:not-allowed;opacity:.45}.control-toggle strong,.control-toggle small{display:block}.control-toggle strong{font-size:11px}.control-toggle small{margin-top:2px;color:#6f91a3;font-size:9px}.toggle-track{position:relative;width:42px;height:24px;border:1px solid #315369;border-radius:999px;background:#0b1a25}.toggle-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#6f91a3;transition:left .2s ease,background .2s ease}.enabled .toggle-knob{left:21px;background:var(--green)}.status-grid,.devices{display:grid;gap:10px}.status-grid{grid-template-columns:1fr 1fr;margin-top:16px}.devices{grid-template-columns:repeat(3,1fr)}.feedback-lines{display:grid;gap:3px;margin-top:8px;color:#6f91a3;font-size:9px}.panel,.device{padding:13px;border:1px solid #17384b;border-radius:14px;background:#081721}.device.pending{border-color:#ffd166;box-shadow:0 0 0 1px rgba(255,209,102,.25),0 0 20px rgba(255,209,102,.08)}.device.unknown{border-style:dashed;opacity:.88}.condition{gap:8px;margin-top:10px}.dot,.log-dot{width:8px;height:8px;border-radius:50%;background:#698a9c}.balanced,.success{color:var(--green)}.warning{color:var(--yellow)}.critical{color:var(--red)}.unknown{color:#789aac}.dot.balanced,.log-dot.success,.log-dot.monitoring{background:var(--green)}.dot.warning,.log-dot.warning{background:var(--yellow)}.dot.critical,.dot.critical_unresolved,.log-dot.critical{background:var(--red)}.dot.pending{background:#ffd166;box-shadow:0 0 12px rgba(255,209,102,.45)}.dot.adjusting,.log-dot.action{background:var(--cyan)}.dot.inactive,.log-dot.inactive,.dot.blocked{background:#698a9c}.vuf-value{margin-top:10px;font-size:30px;font-weight:900}.critical-unresolved-blink{color:var(--red);animation:vuf-critical-unresolved-blink 1s infinite}@keyframes vuf-critical-unresolved-blink{0%,49%{opacity:1}50%,100%{opacity:.25}}.vuf-prediction{margin-left:8px;color:var(--yellow);font-size:16px}.thresholds,.panel p{color:#6f91a3;font-size:9px}.section-head{margin:18px 0 10px}.decision-badges{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}.badge{padding:5px 8px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.pending-badge,.pending-note{color:#ffd166}.pending-note{display:block;margin:-4px 0 8px;font-size:10px;letter-spacing:.03em}.device-value{font-size:26px;font-weight:900}.device-value small{font-size:12px;color:#83a7bd}.segments{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px}.segments.three{grid-template-columns:repeat(3,1fr)}.level-button{height:8px;border:0;border-radius:999px;background:#143042;cursor:pointer}.level-button.active{background:var(--cyan);box-shadow:0 0 10px rgba(88,231,255,.45)}.level-button:disabled{cursor:not-allowed;opacity:.5}.off-button{margin-top:8px;margin-right:5px;padding:5px 8px;border:1px solid #285369;border-radius:7px;background:#0b2635;color:#dff7ff;cursor:pointer;font-size:10px}.off-button.active{border-color:#58e7ff;color:#58e7ff}.zero-hold-button{border-color:#365b70}.binary{margin-top:10px;padding:7px 12px;border:1px solid #284b60;border-radius:999px;background:#eaf6ff;color:#0b1a27;font-weight:800}.binary.on{background:#154b3b;color:#8ff1c3;border-color:#42e38c}.clickable{cursor:pointer}.cooldown{margin-top:12px}.cooldown-track{height:6px;border-radius:999px;background:#102b3b;overflow:hidden}.cooldown-fill{height:100%;background:var(--cyan)}.log{max-height:160px;overflow:auto}.log-entry{display:grid;grid-template-columns:70px 12px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid #123042;font-size:11px}.log time,.log p,.empty{color:#6f91a3}.log p{margin:2px 0 0}.empty{text-align:center;padding:20px}@media(max-width:760px){.status-grid,.devices{grid-template-columns:1fr}.header{flex-direction:column}}
</style>
