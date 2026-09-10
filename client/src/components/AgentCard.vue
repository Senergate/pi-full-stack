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
          <small>{{ autoEnabled ? 'Automatic phase balancing' : 'Operator control' }}</small>
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
          <span v-if="agentState === 'adjusting' && prediction" class="vuf-prediction">({{ formatVuf(prediction.vuf) }})</span>
        </div>
        <div class="thresholds">Balanced &lt; 1% · Warning 1–2% · Critical &gt; 2%</div>
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
        <small v-if="pendingDevices.heatpump" class="pending-note">pending → {{ pendingTargetState.heatpump }}/5</small>
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

        <button type="button" class="off-button" :class="{ active: displayedState.heatpump === 0 }" :disabled="manualControlDisabled" @click="setDeviceState('heatpump', 0)">OFF</button>
        <button type="button" class="off-button zero-hold-button" :disabled="manualControlDisabled" title="Branch-A ZERO_HOLD: start,0" @click="requestHeatpumpZeroHold">ZERO HOLD</button>
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

const CRITICAL_VUF = 2.0;
const SETTLE_TIME_MS = 5000;
const TICK_MS = 250;
const COMMAND_PENDING_TIMEOUT_MS = 3000;
const MIN_IMPROVEMENT = 0.01;
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
});

const emit = defineEmits(['apply-state', 'enabled-change', 'heatpump-zero-hold']);

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
const pendingSince = reactive({ heatpump: null, wallbox: null, batteryCharging: null });

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

const hasPendingDevice = computed(() => pendingDevices.heatpump || pendingDevices.wallbox || pendingDevices.batteryCharging);
const hasUnknownDeviceState = computed(() => Object.values(normalizedDeviceStates.value).some(value => value === null));
const nextBatteryCommand = computed(() => normalizedDeviceStates.value.batteryCharging !== true);
const manualControlDisabled = computed(() => autoEnabled.value || !props.controlReady);

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
  pendingSince[key] = null;
};

const markPending = patch => {
  const current = normalizedDeviceStates.value;
  const startedAt = Date.now();
  for (const key of Object.keys(pendingDevices)) {
    if (!Object.hasOwn(patch, key)) continue;
    pendingDevices[key] = patch[key] !== current[key];
    pendingTargetState[key] = pendingDevices[key] ? patch[key] : null;
    pendingSince[key] = pendingDevices[key] ? startedAt : null;
  }
};

const expirePendingCommands = () => {
  const currentTime = Date.now();
  for (const key of Object.keys(pendingDevices)) {
    if (!pendingDevices[key] || pendingSince[key] === null) continue;
    if (currentTime - pendingSince[key] < COMMAND_PENDING_TIMEOUT_MS) continue;
    const target = pendingTargetState[key];
    clearPending(key);
    addLog('Command confirmation timeout', `${key} target ${String(target)} was not confirmed within 3 s. Pending was released; execution was NOT assumed successful.`, 'warning');
  }
};

watch(normalizedDeviceStates, current => {
  for (const key of Object.keys(pendingDevices)) {
    if (pendingDevices[key] && current[key] === pendingTargetState[key]) clearPending(key);
  }
}, { deep: true });

const conditionForVuf = value => {
  if (value === null || value === undefined || value === '') return { label: 'Unknown', className: 'unknown' };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { label: 'Unknown', className: 'unknown' };
  if (numeric > 2) return { label: 'Critical', className: 'critical' };
  if (numeric > 1) return { label: 'Warning', className: 'warning' };
  return { label: 'Balanced', className: 'balanced' };
};

const condition = computed(() => conditionForVuf(props.vuf));
const vuf = computed(() => props.vuf);

const cooldownRemaining = computed(() => Math.max(0, (cooldownUntil.value - now.value) / 1000));
const cooldownProgress = computed(() => 100 - Math.min(100, (cooldownRemaining.value / (SETTLE_TIME_MS / 1000)) * 100));

const formatVuf = value => {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : '--';
};

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
  if (agentState.value === 'adjusting') return 'A device adjustment was selected. Waiting for the physical system to settle.';
  return 'Automatic control is monitoring total model-estimated VUF.';
});

const predictCandidate = async state => {
  const vufValue = await props.predictVuf(state);
  if (vufValue === null || vufValue === undefined) return null;
  const numeric = Number(vufValue);
  if (!Number.isFinite(numeric)) return null;
  return { state, vuf: numeric };
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

const evaluateCandidates = async candidates => {
  const results = [];
  for (const candidate of candidates) {
    const result = await predictCandidate(candidate);
    if (result) results.push(result);
  }
  if (results.length === 0) return null;
  results.sort((a, b) => a.vuf - b.vuf);
  return results[0];
};

const chooseNextAction = async () => {
  if (hasUnknownDeviceState.value) return null;
  const current = { ...normalizedDeviceStates.value };

  // Compare every permitted one-step transition in one search space. This
  // avoids the old reduction-first greedy behaviour and lets Branch B win
  // when adding an equivalent wallbox improves VUF more than trimming Branch A.
  const candidates = [
    ...getReductionCandidates(current),
    ...getCompensationCandidates(current),
  ];

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  const best = await evaluateCandidates(unique);
  if (!best || best.vuf >= Number(props.vuf) - MIN_IMPROVEMENT) return null;
  return { ...best, reason: 'optimize' };
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
    addLog(repeatedViolation ? 'VUF still violated' : 'VUF violation detected', `Estimated VUF is ${formatVuf(props.vuf)}.`, 'critical');
    const action = await chooseNextAction();
    if (!autoEnabled.value) return;
    if (!action) {
      prediction.value = null;
      agentState.value = 'monitoring';
      addLog('No permitted adjustment found', 'No one-step reduction or compensation action is predicted to improve VUF.', 'warning');
      return;
    }

    prediction.value = action;
    const current = normalizedDeviceStates.value;
    const patch = {};
    for (const key of ['heatpump', 'wallbox', 'batteryCharging']) {
      if (action.state[key] !== current[key]) patch[key] = action.state[key];
    }
    if (Object.keys(patch).length === 0) return;
    markPending(patch);
    emit('apply-state', patch);
    addLog(
      'Best one-step balancing action selected',
      [`Heat pump ${action.state.heatpump}/5`, `Wallbox ${action.state.wallbox}/3`, `Battery ${action.state.batteryCharging ? 'ON' : 'OFF'}`, `Predicted VUF ${formatVuf(action.vuf)}`].join(' · '),
      'action'
    );
    agentState.value = 'adjusting';
    cooldownUntil.value = Date.now() + SETTLE_TIME_MS;
  } finally {
    evaluating.value = false;
  }
};

const evaluateAgent = async () => {
  now.value = Date.now();
  expirePendingCommands();
  if (!autoEnabled.value || evaluating.value) return;
  if (!props.controlReady) {
    agentState.value = 'blocked';
    prediction.value = null;
    return;
  }
  // Do not let enabling AI replace a command that is still waiting for
  // execution feedback. The pending target remains visible across the toggle.
  if (hasPendingDevice.value) {
    agentState.value = 'monitoring';
    prediction.value = null;
    return;
  }
  if (props.vuf === null || props.vuf === undefined || props.vuf === '' || hasUnknownDeviceState.value) {
    agentState.value = 'monitoring';
    prediction.value = null;
    return;
  }

  const currentVuf = Number(props.vuf);
  if (!Number.isFinite(currentVuf)) return;

  if (agentState.value === 'adjusting') {
    if (now.value < cooldownUntil.value) return;
    if (currentVuf > CRITICAL_VUF) { await selectAndApplyState(true); return; }
    prediction.value = null;
    agentState.value = 'monitoring';
    addLog('VUF stabilized', `Estimated VUF is now ${formatVuf(currentVuf)}.`, 'success');
    return;
  }

  agentState.value = 'monitoring';
  if (currentVuf > CRITICAL_VUF) await selectAndApplyState(false);
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

  markPending(patch);
  emit('apply-state', patch);

  const nextState = { ...displayedState.value, ...patch };
  addLog('Manual device state changed', [`Heat pump ${formatDeviceLevel(nextState.heatpump)}/5`, `Wallbox ${formatDeviceLevel(nextState.wallbox)}/3`, `Battery ${formatBinary(nextState.batteryCharging)}`].join(' · '), 'info');
};

const requestHeatpumpZeroHold = () => {
  if (!props.controlReady) return;
  prediction.value = null;
  const patch = { heatpump: 0 };
  markPending(patch);
  emit('heatpump-zero-hold');
  addLog('Heat pump ZERO_HOLD requested', 'Manual ZERO_HOLD uses Branch-A start,0 and is intentionally different from OFF/STOP.', 'info');
};

onMounted(() => { timer.value = window.setInterval(evaluateAgent, TICK_MS); });
onUnmounted(() => { if (timer.value) window.clearInterval(timer.value); });
</script>

<style scoped>
.agent-card{--text:#eaf6ff;--muted:#83a7bd;--cyan:#58e7ff;--green:#42e38c;--yellow:#ffd166;--red:#ff5c6c;padding:18px;color:var(--text);border:1px solid #163448;border-radius:20px;background:linear-gradient(180deg,rgba(12,30,44,.96),rgba(6,18,28,.96));box-shadow:0 20px 60px rgba(0,0,0,.34)}.header,.section-head,.condition,.device-head,.cooldown-label{display:flex;align-items:center}.header,.section-head,.device-head,.cooldown-label{justify-content:space-between}.header{align-items:flex-start;gap:16px}.eyebrow,.panel-label{color:#6f9ab1;font-size:10px;letter-spacing:.14em;text-transform:uppercase}h2,h3{margin:4px 0 0}h2{font-size:18px}h3{font-size:14px}.control-toggle{display:flex;align-items:center;gap:11px;padding:10px 13px;border:1px solid #294d62;border-radius:14px;color:#9cb8c9;background:#081721;cursor:pointer}.control-toggle.enabled{border-color:rgba(66,227,140,.55);color:#eafff4;background:rgba(21,75,59,.35)}.control-toggle:disabled,.off-button:disabled,.binary:disabled{cursor:not-allowed;opacity:.45}.control-toggle strong,.control-toggle small{display:block}.control-toggle strong{font-size:11px}.control-toggle small{margin-top:2px;color:#6f91a3;font-size:9px}.toggle-track{position:relative;width:42px;height:24px;border:1px solid #315369;border-radius:999px;background:#0b1a25}.toggle-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#6f91a3;transition:left .2s ease,background .2s ease}.enabled .toggle-knob{left:21px;background:var(--green)}.status-grid,.devices{display:grid;gap:10px}.status-grid{grid-template-columns:1fr 1fr;margin-top:16px}.devices{grid-template-columns:repeat(3,1fr)}.feedback-lines{display:grid;gap:3px;margin-top:8px;color:#6f91a3;font-size:9px}.panel,.device{padding:13px;border:1px solid #17384b;border-radius:14px;background:#081721}.device.pending{border-color:#ffd166;box-shadow:0 0 0 1px rgba(255,209,102,.25),0 0 20px rgba(255,209,102,.08)}.device.unknown{border-style:dashed;opacity:.88}.condition{gap:8px;margin-top:10px}.dot,.log-dot{width:8px;height:8px;border-radius:50%;background:#698a9c}.balanced,.success{color:var(--green)}.warning{color:var(--yellow)}.critical{color:var(--red)}.unknown{color:#789aac}.dot.balanced,.log-dot.success,.log-dot.monitoring{background:var(--green)}.dot.warning,.log-dot.warning{background:var(--yellow)}.dot.critical,.log-dot.critical{background:var(--red)}.dot.adjusting,.log-dot.action{background:var(--cyan)}.dot.inactive,.log-dot.inactive,.dot.blocked{background:#698a9c}.vuf-value{margin-top:10px;font-size:30px;font-weight:900}.vuf-prediction{margin-left:8px;color:var(--yellow);font-size:16px}.thresholds,.panel p{color:#6f91a3;font-size:9px}.section-head{margin:18px 0 10px}.decision-badges{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}.badge{padding:5px 8px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.pending-badge,.pending-note{color:#ffd166}.pending-note{display:block;margin:-4px 0 8px;font-size:10px;letter-spacing:.03em}.device-value{font-size:26px;font-weight:900}.device-value small{font-size:12px;color:#83a7bd}.segments{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:8px}.segments.three{grid-template-columns:repeat(3,1fr)}.level-button{height:8px;border:0;border-radius:999px;background:#143042;cursor:pointer}.level-button.active{background:var(--cyan);box-shadow:0 0 10px rgba(88,231,255,.45)}.level-button:disabled{cursor:not-allowed;opacity:.5}.off-button{margin-top:8px;margin-right:5px;padding:5px 8px;border:1px solid #285369;border-radius:7px;background:#0b2635;color:#dff7ff;cursor:pointer;font-size:10px}.off-button.active{border-color:#58e7ff;color:#58e7ff}.zero-hold-button{border-color:#365b70}.binary{margin-top:10px;padding:7px 12px;border:1px solid #284b60;border-radius:999px;background:#eaf6ff;color:#0b1a27;font-weight:800}.binary.on{background:#154b3b;color:#8ff1c3;border-color:#42e38c}.clickable{cursor:pointer}.cooldown{margin-top:12px}.cooldown-track{height:6px;border-radius:999px;background:#102b3b;overflow:hidden}.cooldown-fill{height:100%;background:var(--cyan)}.log{max-height:160px;overflow:auto}.log-entry{display:grid;grid-template-columns:70px 12px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid #123042;font-size:11px}.log time,.log p,.empty{color:#6f91a3}.log p{margin:2px 0 0}.empty{text-align:center;padding:20px}@media(max-width:760px){.status-grid,.devices{grid-template-columns:1fr}.header{flex-direction:column}}
</style>
