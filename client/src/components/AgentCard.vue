<template>
  <section class="agent-card">
    <div class="header">
      <div>
        <div class="eyebrow">Automatic control</div>
        <h2>Senergate AI Agent</h2>
      </div>

      <button type="button" class="control-toggle" :class="{ enabled: autoEnabled }" @click="toggleAuto">
        <span class="toggle-track">
          <span class="toggle-knob" />
        </span>

        <span>
          <strong>
            {{ autoEnabled ? 'AI CONTROL ON' : 'AI CONTROL OFF' }}
          </strong>
          <small>
            {{ autoEnabled ? 'Automatic phase balancing' : 'Operator control' }}
          </small>
        </span>
      </button>
    </div>

    <div class="status-grid">
      <div class="panel">
        <div class="panel-label">Grid condition</div>

        <div class="condition">
          <span class="dot" :class="condition.className" />
          <strong :class="condition.className">
            {{ condition.label }}
          </strong>
        </div>

        <div class="vuf-value">
          <span>{{ formatVuf(vuf) }}</span>

          <span v-if="agentState === 'adjusting' && prediction" class="vuf-prediction">
            ({{ formatVuf(prediction.vuf) }} predicted)
          </span>
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
        <div class="panel-label">Discovered Devices</div>
      </div>

      <span v-if="hasPendingDevice" class="badge pending-badge"> COMMAND PENDING </span>
    </div>

    <div class="devices">
      <div class="device" :class="{ pending: pendingDevices.heatpump }">
        <div class="device-head">
          <span>Heat pump</span>
          <span>L1</span>
        </div>

        <!-- <div class="device-value"> -->
        <!--   {{ normalizedDeviceStates.heatpump }} -->
        <!--   <small>/ 5</small> -->
        <!-- </div> -->

        <div class="segments" style="padding-top: 1.5em">
          <button
            v-for="level in [0, 1, 2, 3, 4, 5]"
            :key="level"
            type="button"
            class="level-button"
            :class="{
              active: level <= normalizedDeviceStates.heatpump,
              'power-on': level === 0 && normalizedDeviceStates.heatpump > 0,
              'power-off': level === 0 && normalizedDeviceStates.heatpump === 0,
            }"
            :title="`Set heatpump to level ${level}`"
            @click="setDeviceState('heatpump', level)"
          >
            {{ level === 0 ? 'OFF' : '' }}
          </button>
        </div>
      </div>

      <div class="device" :class="{ pending: pendingDevices.wallbox }">
        <div class="device-head">
          <span>Wallbox</span>
          <span>L2</span>
        </div>

        <!-- <div class="device-value"> -->
        <!--   {{ normalizedDeviceStates.wallbox }} -->
        <!--   <small>/ 3</small> -->
        <!-- </div> -->

        <div class="segments" style="padding-top: 1.5em">
          <button
            v-for="level in [0, 1, 2, 3]"
            :key="level"
            type="button"
            class="level-button"
            :class="{
              active: level <= normalizedDeviceStates.wallbox,
              'power-on': level === 0 && normalizedDeviceStates.wallbox > 0,
              'power-off': level === 0 && normalizedDeviceStates.wallbox === 0,
            }"
            :title="`Set wallbox to level ${level}`"
            @click="setDeviceState('wallbox', level)"
          >
            {{ level === 0 ? 'OFF' : '' }}
          </button>
        </div>
      </div>

      <div class="device" :class="{ pending: pendingDevices.batteryCharging }">
        <div class="device-head">
          <span>Battery charging</span>
          <span>L3</span>
        </div>

        <div class="segments" style="padding-top: 1.5em">
          <button
            type="button"
            class="binary clickable level-button"
            :class="{ on: normalizedDeviceStates.batteryCharging }"
            @click="setDeviceState('batteryCharging', !normalizedDeviceStates.batteryCharging)"
          >
            {{ normalizedDeviceStates.batteryCharging ? 'ON' : 'OFF' }}
          </button>
        </div>
      </div>
    </div>

    <div class="section-head">
      <div>
        <div class="panel-label">Decision Log</div>
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
const MIN_IMPROVEMENT = 0.01;

const MAX_HEATPUMP = 5;
const MAX_WALLBOX = 3;
const MIN_LOAD_RATIO = 0.5;

const props = defineProps({
  vuf: {
    type: Number,
    required: true,
  },

  deviceStates: {
    type: Object,
    required: true,
  },

  predictVuf: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['apply-state', 'enabled-change']);

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

/*
 * Pending state is visual only.
 * The UI always keeps showing the latest REPORT from the devices.
 */
const pendingDevices = reactive({
  heatpump: false,
  wallbox: false,
  batteryCharging: false,
});

const pendingFromState = reactive({
  heatpump: null,
  wallbox: null,
  batteryCharging: null,
});

const hasPendingDevice = computed(
  () => pendingDevices.heatpump || pendingDevices.wallbox || pendingDevices.batteryCharging
);

const clampInt = (value, min, max) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
};

/*
 * This is the only state used to render the device controls.
 * It always reflects the latest value reported by SimpleDashboard.
 */
const normalizedDeviceStates = computed(() => ({
  heatpump: clampInt(props.deviceStates?.heatpump, 0, MAX_HEATPUMP),

  wallbox: clampInt(props.deviceStates?.wallbox, 0, MAX_WALLBOX),

  batteryCharging: props.deviceStates?.batteryCharging === true,
}));

const markPendingChanges = state => {
  const current = normalizedDeviceStates.value;

  if (state.heatpump !== current.heatpump) {
    pendingDevices.heatpump = true;
    pendingFromState.heatpump = current.heatpump;
  }

  if (state.wallbox !== current.wallbox) {
    pendingDevices.wallbox = true;
    pendingFromState.wallbox = current.wallbox;
  }

  if (state.batteryCharging !== current.batteryCharging) {
    pendingDevices.batteryCharging = true;
    pendingFromState.batteryCharging = current.batteryCharging;
  }
};

const clearPending = device => {
  pendingDevices[device] = false;
  pendingFromState[device] = null;
};

/*
 * Clear gray/pending state when a new reported value arrives.
 * We deliberately do not switch the UI at command time.
 */
watch(
  () => normalizedDeviceStates.value.heatpump,
  value => {
    if (pendingDevices.heatpump && value !== pendingFromState.heatpump) {
      clearPending('heatpump');
    }
  }
);

watch(
  () => normalizedDeviceStates.value.wallbox,
  value => {
    if (pendingDevices.wallbox && value !== pendingFromState.wallbox) {
      clearPending('wallbox');
    }
  }
);

watch(
  () => normalizedDeviceStates.value.batteryCharging,
  value => {
    if (pendingDevices.batteryCharging && value !== pendingFromState.batteryCharging) {
      clearPending('batteryCharging');
    }
  }
);

const conditionForVuf = value => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return {
      label: 'Unknown',
      className: 'unknown',
    };
  }

  if (numeric < 1) {
    return {
      label: 'Balanced',
      className: 'balanced',
    };
  }

  if (numeric <= CRITICAL_VUF) {
    return {
      label: 'Warning',
      className: 'warning',
    };
  }

  return {
    label: 'Critical',
    className: 'critical',
  };
};

const condition = computed(() => conditionForVuf(props.vuf));

const agentStateDescription = computed(() => {
  if (agentState.value === 'inactive') {
    return 'Automatic control is disabled.';
  }

  if (agentState.value === 'adjusting') {
    return 'A device adjustment was requested. Waiting for the physical system to settle.';
  }

  return 'Automatic control is monitoring VUF.';
});

const cooldownRemaining = computed(() => {
  if (agentState.value !== 'adjusting') {
    return 0;
  }

  return Math.max(0, (cooldownUntil.value - now.value) / 1000);
});

const cooldownProgress = computed(() =>
  Math.max(0, Math.min(100, ((cooldownRemaining.value * 1000) / SETTLE_TIME_MS) * 100))
);

const formatVuf = value => {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : '--';
};

const addLog = (title, message = '', type = 'info') => {
  logs.value.push({
    id: ++logId.value,

    time: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),

    title,
    message,
    type,
  });

  if (logs.value.length > 100) {
    logs.value.splice(0, logs.value.length - 100);
  }

  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
};

/*
 * Manual controls remain clickable even while a command is pending.
 */
const setDeviceState = (device, value) => {
  const state = {
    ...normalizedDeviceStates.value,
  };

  if (device === 'heatpump') {
    state.heatpump = clampInt(value, 0, MAX_HEATPUMP);
  }

  if (device === 'wallbox') {
    state.wallbox = clampInt(value, 0, MAX_WALLBOX);
  }

  if (device === 'batteryCharging') {
    state.batteryCharging = value === true;
  }

  markPendingChanges(state);

  emit('apply-state', state);

  addLog(
    'Manual device state requested',
    [
      `Heat pump ${state.heatpump}/5`,
      `Wallbox ${state.wallbox}/3`,
      `Battery ${state.batteryCharging ? 'ON' : 'OFF'}`,
    ].join(' · '),
    'info'
  );
};

const predictCandidate = async state => {
  try {
    const predicted = Number(await props.predictVuf(state));

    if (!Number.isFinite(predicted)) {
      return null;
    }

    return {
      state,
      vuf: predicted,
    };
  } catch (error) {
    console.error('AgentCard prediction failed', error);

    return null;
  }
};

const getReductionCandidates = current => {
  const candidates = [];

  if (current.heatpump > 0) {
    const nextLevel = current.heatpump - 1;

    if (nextLevel / MAX_HEATPUMP >= MIN_LOAD_RATIO) {
      candidates.push({
        ...current,
        heatpump: nextLevel,
      });
    }
  }

  if (current.wallbox > 0) {
    const nextLevel = current.wallbox - 1;

    if (nextLevel / MAX_WALLBOX >= MIN_LOAD_RATIO) {
      candidates.push({
        ...current,
        wallbox: nextLevel,
      });
    }
  }

  if (current.batteryCharging) {
    candidates.push({
      ...current,
      batteryCharging: false,
    });
  }

  return candidates;
};

const hasBlockedReduction = current => {
  if (current.heatpump > 0) {
    const nextLevel = current.heatpump - 1;

    if (nextLevel / MAX_HEATPUMP < MIN_LOAD_RATIO) {
      return true;
    }
  }

  if (current.wallbox > 0) {
    const nextLevel = current.wallbox - 1;

    if (nextLevel / MAX_WALLBOX < MIN_LOAD_RATIO) {
      return true;
    }
  }

  return false;
};

const getCompensationCandidates = current => {
  const candidates = [];

  if (current.heatpump === 0) {
    candidates.push({
      ...current,
      heatpump: 1,
    });
  }

  if (current.wallbox === 0) {
    candidates.push({
      ...current,
      wallbox: 1,
    });
  }

  if (!current.batteryCharging) {
    candidates.push({
      ...current,
      batteryCharging: true,
    });
  }

  return candidates;
};

const evaluateCandidates = async candidates => {
  const results = [];

  for (const candidate of candidates) {
    const result = await predictCandidate(candidate);

    if (result) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return null;
  }

  results.sort((a, b) => a.vuf - b.vuf);

  return results[0];
};

const chooseNextAction = async () => {
  const current = {
    ...normalizedDeviceStates.value,
  };

  const reductions = getReductionCandidates(current);

  if (reductions.length > 0) {
    const bestReduction = await evaluateCandidates(reductions);

    if (bestReduction && bestReduction.vuf < Number(props.vuf) - MIN_IMPROVEMENT) {
      return {
        ...bestReduction,
        reason: 'reduce',
      };
    }
  }

  if (hasBlockedReduction(current)) {
    const compensations = getCompensationCandidates(current);

    const bestCompensation = await evaluateCandidates(compensations);

    if (bestCompensation && bestCompensation.vuf < Number(props.vuf) - MIN_IMPROVEMENT) {
      return {
        ...bestCompensation,
        reason: 'compensate',
      };
    }
  }

  return null;
};

const selectAndApplyState = async repeatedViolation => {
  if (!autoEnabled.value || evaluating.value) {
    return;
  }

  evaluating.value = true;

  try {
    addLog(
      repeatedViolation ? 'VUF still violated' : 'VUF violation detected',

      `Measured VUF is ${formatVuf(props.vuf)}.`,

      'critical'
    );

    const action = await chooseNextAction();

    if (!autoEnabled.value) {
      return;
    }

    if (!action) {
      prediction.value = null;
      agentState.value = 'monitoring';

      addLog(
        'No permitted adjustment found',
        'No policy-approved one-step action is predicted to improve VUF.',
        'warning'
      );

      return;
    }

    prediction.value = action;

    /*
     * Gray changed devices before emitting, but keep their displayed
     * values at the last reported state.
     */
    markPendingChanges(action.state);

    addLog(
      action.reason === 'reduce' ? 'Active load reduction requested' : 'Compensation requested',

      [
        `Heat pump ${action.state.heatpump}/5`,
        `Wallbox ${action.state.wallbox}/3`,
        `Battery ${action.state.batteryCharging ? 'ON' : 'OFF'}`,
        `Predicted VUF ${formatVuf(action.vuf)}`,
      ].join(' · '),

      'action'
    );

    emit('apply-state', {
      ...action.state,
    });

    agentState.value = 'adjusting';

    cooldownUntil.value = Date.now() + SETTLE_TIME_MS;
  } finally {
    evaluating.value = false;
  }
};

const evaluateAgent = async () => {
  now.value = Date.now();

  if (!autoEnabled.value || evaluating.value) {
    return;
  }

  const currentVuf = Number(props.vuf);

  if (!Number.isFinite(currentVuf)) {
    return;
  }

  if (agentState.value === 'adjusting') {
    if (now.value < cooldownUntil.value) {
      return;
    }

    if (currentVuf > CRITICAL_VUF) {
      await selectAndApplyState(true);
      return;
    }

    prediction.value = null;
    agentState.value = 'monitoring';

    addLog('VUF stabilized', `Measured VUF is now ${formatVuf(currentVuf)}.`, 'success');

    addLog('Monitoring resumed', 'Waiting for the next VUF violation.', 'monitoring');

    return;
  }

  agentState.value = 'monitoring';

  if (currentVuf > CRITICAL_VUF) {
    await selectAndApplyState(false);
  }
};

const toggleAuto = () => {
  autoEnabled.value = !autoEnabled.value;

  emit('enabled-change', autoEnabled.value);

  prediction.value = null;
  cooldownUntil.value = 0;

  if (autoEnabled.value) {
    agentState.value = 'monitoring';

    addLog('Monitoring started', 'Automatic VUF control enabled.', 'monitoring');

    evaluateAgent();
    return;
  }

  agentState.value = 'inactive';

  addLog('Agent inactive', 'Automatic VUF control disabled.', 'inactive');
};

watch(
  () => props.vuf,
  () => {
    if (autoEnabled.value && agentState.value === 'monitoring') {
      evaluateAgent();
    }
  }
);

onMounted(() => {
  timer.value = window.setInterval(evaluateAgent, TICK_MS);
});

onUnmounted(() => {
  if (timer.value) {
    window.clearInterval(timer.value);
  }
});
</script>

<style scoped>
.agent-card {
  --text: #eaf6ff;
  --muted: #83a7bd;
  --cyan: #58e7ff;
  --green: #42e38c;
  --yellow: #ffd166;
  --red: #ff5c6c;

  padding: 18px;
  color: var(--text);
  border: 1px solid #163448;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(12, 30, 44, 0.96), rgba(6, 18, 28, 0.96));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.34);
}

.header,
.section-head,
.condition,
.device-head,
.cooldown-label {
  display: flex;
  align-items: center;
}

.header,
.section-head,
.device-head,
.cooldown-label {
  justify-content: space-between;
}

.header {
  align-items: flex-start;
  gap: 16px;
}

.eyebrow,
.panel-label {
  color: #6f9ab1;
  font-size: 18px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 4px 0 0;
}

h2 {
  font-size: 18px;
}
h3 {
  font-size: 14px;
}

.control-toggle {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 13px;
  border: 1px solid #294d62;
  border-radius: 14px;
  color: #9cb8c9;
  background: #081721;
  cursor: pointer;
}

.control-toggle.enabled {
  border-color: rgba(66, 227, 140, 0.55);
  color: #eafff4;
  background: rgba(21, 75, 59, 0.35);
}

.control-toggle strong,
.control-toggle small {
  display: block;
}

.control-toggle strong {
  font-size: 11px;
}
.control-toggle small {
  margin-top: 2px;
  color: #6f91a3;
  font-size: 9px;
}

.toggle-track {
  position: relative;
  width: 42px;
  height: 24px;
  border: 1px solid #315369;
  border-radius: 999px;
  background: #0b1a25;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6f91a3;
  transition:
    left 0.2s ease,
    background 0.2s ease;
}

.enabled .toggle-knob {
  left: 21px;
  background: var(--green);
}

.status-grid,
.devices {
  display: grid;
  gap: 10px;
}

.status-grid {
  grid-template-columns: 1fr 1fr;
  margin-top: 16px;
}

.devices {
  grid-template-columns: repeat(3, 1fr);
}

.panel,
.device {
  padding: 13px;
  border: 1px solid #17384b;
  border-radius: 14px;
  background: #081721;
}

.condition {
  gap: 8px;
  margin-top: 10px;
}

.dot,
.log-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #698a9c;
}

.balanced,
.success {
  color: var(--green);
}
.warning {
  color: var(--yellow);
}
.critical {
  color: var(--red);
}

.dot.balanced,
.log-dot.success,
.log-dot.monitoring {
  background: var(--green);
}
.dot.warning,
.log-dot.warning {
  background: var(--yellow);
}
.dot.critical,
.log-dot.critical {
  background: var(--red);
}
.dot.monitoring {
  background: var(--green);
}
.dot.adjusting,
.log-dot.action {
  background: var(--cyan);
}
.dot.inactive,
.log-dot.inactive {
  background: #698a9c;
}

.vuf-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 10px;
  font-size: 30px;
  font-weight: 900;
}

.vuf-prediction {
  color: var(--cyan);
  font-size: 15px;
  font-weight: 700;
}

.thresholds,
.panel p {
  color: #6f91a3;
  font-size: 9px;
}

.panel p {
  margin: 8px 0 0;
  line-height: 1.45;
}

.cooldown {
  margin-top: 12px;
}
.cooldown-label {
  color: #789cad;
  font-size: 9px;
}
.cooldown-track {
  height: 5px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #102836;
}
.cooldown-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  transition: width 0.25s linear;
}

.section-head {
  margin: 17px 0 8px;
}

.badge {
  padding: 5px 8px;
  border: 1px solid #29566b;
  border-radius: 999px;
  color: #8edff0;
  font-size: 8px;
}

.pending-badge {
  color: #aeb8be;
  border-color: #53636b;
}

.device {
  position: relative;
  transition:
    opacity 0.2s ease,
    filter 0.2s ease,
    border-color 0.2s ease;
}

/* Gray while waiting for the next reported state, but stay clickable. */
.device.pending {
  opacity: 0.55;
  filter: grayscale(0.9);
  border-color: #58646a;
}

.device.pending::after {
  content: 'WAITING FOR REPORT';
  position: absolute;
  right: 9px;
  bottom: 7px;
  color: #a6b0b5;
  font-size: 7px;
  letter-spacing: 0.08em;
  pointer-events: none;
}

.device-head {
  color: #87a9ba;
  font-size: 16px;
}

.device-value {
  margin-top: 7px;
  font-size: 24px;
  font-weight: 800;
}

.device-value small {
  color: #789cad;
  font-size: 10px;
}

.segments {
  display: flex;
  gap: 2px;
  width: 100%;
  margin-top: 8px;
}

.segments .level-button {
  flex: 1 1 0;
  min-width: 0;
  margin-top: 0;
}

/* Make the power button visually distinct */
.segments .level-button:first-child {
  margin-right: 5px;

  border-radius: 999px;

  font-size: 8px;
  letter-spacing: 0.08em;
}

/* Device is running */
.segments .level-button:first-child.power-on {
  color: #8ff1c3;
  border-color: #2b6f62;
  background: rgba(66, 227, 140, 0.1);
}

/* Device is off */
.segments .level-button:first-child.power-off {
  color: #82949e;
  border-color: #3b4d57;
  background: #111d24;
}

.segments.three {
  grid-template-columns: repeat(3, 1fr);
}

.level-button {
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: #183547;
  cursor: pointer;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
  min-height: 1.5em;
}

.level-button:hover {
  background: #28566e;
}

.level-button.active {
  background: var(--cyan);
  box-shadow: 0 0 7px rgba(88, 231, 255, 0.25);
}

.off-button {
  margin-top: 9px;
  padding: 4px 8px;
  color: #6f91a3;
  border: 1px solid #24495d;
  border-radius: 7px;
  background: transparent;
  font-size: 8px;
  font-weight: 700;
  cursor: pointer;
}

.off-button.active {
  color: #d7e8f1;
  border-color: #3b6479;
  background: #112837;
}

.binary {
  display: inline-block;
  margin-top: 10px;
  padding: 6px 10px;
  border: 1px solid #24495d;
  border-radius: 999px;
  color: #769bad;
  background: #0b1c29;
  font-size: 11px;
  font-weight: 800;
}

.binary.on {
  border-color: #2b6f62;
  color: #8ff1c3;
  background: rgba(66, 227, 140, 0.08);
}

.binary.clickable {
  cursor: pointer;
}
.binary.clickable:hover {
  border-color: #3a6a80;
}

.log {
  height: 190px;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
}

.log-entry {
  display: grid;
  grid-template-columns: 65px 9px 1fr;
  gap: 8px;
  align-items: start;
  padding: 9px 0;
  border-bottom: 1px solid #123042;
}

.log-entry time {
  color: #5e8498;
  font-size: 9px;
}
.log-entry strong {
  display: block;
  color: #dff5ff;
  font-size: 10px;
}
.log-entry p {
  margin: 2px 0 0;
  color: #6f91a3;
  font-size: 9px;
  line-height: 1.4;
}
.log-dot {
  margin-top: 3px;
}
.empty {
  padding: 18px;
  color: #587d91;
  font-size: 10px;
  text-align: center;
}

@media (max-width: 760px) {
  .header {
    flex-direction: column;
  }
  .control-toggle {
    width: 100%;
  }
  .status-grid,
  .devices {
    grid-template-columns: 1fr;
  }
}
</style>
