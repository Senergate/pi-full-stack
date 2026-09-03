<template>
  <section class="agent-card">
    <div class="header">
      <div>
        <div class="eyebrow">Automatic control</div>
        <h2>Senergate AI Agent</h2>
      </div>

      <button type="button" class="control-toggle" :class="{ enabled: autoEnabled }" @click="toggleAuto">
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
          <span>
            {{ formatVuf(vuf) }}
          </span>

          <span v-if="agentState === 'adjusting' && prediction" class="vuf-prediction">
            ({{ formatVuf(prediction.vuf) }})
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
        <div class="panel-label">Control decision</div>
        <h3>{{ prediction ? 'Selected device state' : 'Current device state' }}</h3>
      </div>
      <span v-if="prediction" class="badge">PREDICTED</span>
      <span v-else-if="hasPendingDevice" class="badge pending-badge">COMMAND PENDING</span>
    </div>

    <div class="devices">
      <!-- Heat pump -->
      <div class="device" :class="{ pending: pendingDevices.heatpump }">
        <div class="device-head">
          <span>Heat pump</span>
          <span>L1</span>
        </div>

        <div class="device-value">
          {{ displayedState.heatpump }}
          <small>/ 5</small>
        </div>
        <small v-if="pendingDevices.heatpump" class="pending-note">pending → {{ pendingTargetState.heatpump }}/5</small>

        <div class="segments">
          <button
            v-for="level in 5"
            :key="level"
            type="button"
            class="level-button"
            :class="{
              active: level <= displayedState.heatpump,
            }"
            :disabled="autoEnabled"
            :title="`Set heat pump to level ${level}`"
            @click="setDeviceState('heatpump', level)"
          />
        </div>

        <button
          type="button"
          class="off-button"
          :class="{ active: displayedState.heatpump === 0 }"
          :disabled="autoEnabled"
          @click="setDeviceState('heatpump', 0)"
        >
          OFF
        </button>

        <button
          type="button"
          class="off-button zero-hold-button"
          :disabled="autoEnabled"
          title="Keep Branch A in ZERO_HOLD: start,0 instead of stop,0"
          @click="requestHeatpumpZeroHold"
        >
          ZERO HOLD
        </button>
      </div>

      <!-- Wallbox -->
      <div class="device" :class="{ pending: pendingDevices.wallbox }">
        <div class="device-head">
          <span>Wallbox</span>
          <span>L2</span>
        </div>

        <div class="device-value">
          {{ displayedState.wallbox }}
          <small>/ 3</small>
        </div>
        <small v-if="pendingDevices.wallbox" class="pending-note">pending → {{ pendingTargetState.wallbox }}/3</small>

        <div class="segments three">
          <button
            v-for="level in 3"
            :key="level"
            type="button"
            class="level-button"
            :class="{
              active: level <= displayedState.wallbox,
            }"
            :disabled="autoEnabled"
            :title="`Set wallbox to level ${level}`"
            @click="setDeviceState('wallbox', level)"
          />
        </div>

        <button
          type="button"
          class="off-button"
          :class="{ active: displayedState.wallbox === 0 }"
          :disabled="autoEnabled"
          @click="setDeviceState('wallbox', 0)"
        >
          OFF
        </button>
      </div>

      <!-- Battery -->
      <div class="device" :class="{ pending: pendingDevices.batteryCharging }">
        <div class="device-head">
          <span>Battery charging</span>
          <span>L3</span>
        </div>

        <button
          type="button"
          class="binary clickable"
          :class="{ on: displayedState.batteryCharging }"
          :disabled="autoEnabled"
          @click="setDeviceState('batteryCharging', !normalizedDeviceStates.batteryCharging)"
        >
          {{ displayedState.batteryCharging ? 'ON' : 'OFF' }}
        </button>
        <small v-if="pendingDevices.batteryCharging" class="pending-note">pending → {{ pendingTargetState.batteryCharging ? 'ON' : 'OFF' }}</small>
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

/*
 * ============================================================
 * CONFIG
 * ============================================================
 */

const CRITICAL_VUF = 2.0;
const SETTLE_TIME_MS = 5000;
const TICK_MS = 250;
const MIN_IMPROVEMENT = 0.01;

const MAX_HEATPUMP = 5;
const MAX_WALLBOX = 3;

/*
 * A running proportional device should not be reduced below
 * 50% of its maximum before we first try compensation by
 * activating another device.
 *
 * Wallbox:
 * max = 3
 * 50% = 1.5
 *
 * 3 -> 2  allowed
 * 2 -> 1  crosses below 50%, so compensation is tried instead.
 *
 * Heat pump:
 * max = 5
 * 50% = 2.5
 *
 * 5 -> 4  allowed
 * 4 -> 3  allowed
 * 3 -> 2  crosses below 50%.
 */
const MIN_LOAD_RATIO = 0.5;

/*
 * ============================================================
 * PROPS / EVENTS
 * ============================================================
 */

const props = defineProps({
  vuf: {
    type: Number,
    required: true,
  },

  /*
   * {
   *   heatpump: 0..5,
   *   wallbox: 0..3,
   *   batteryCharging: boolean
   * }
   */
  deviceStates: {
    type: Object,
    required: true,
  },

  /*
   * candidate => predicted VUF
   *
   * May return Number or Promise<Number>.
   */
  predictVuf: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['apply-state', 'enabled-change', 'heatpump-zero-hold']);

/*
 * ============================================================
 * STATE
 * ============================================================
 */

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
 * ============================================================
 * DEVICE STATE
 * ============================================================
 */

const clampInt = (value, min, max) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
};

const normalizedDeviceStates = computed(() => ({
  heatpump: clampInt(props.deviceStates?.heatpump, 0, MAX_HEATPUMP),

  wallbox: clampInt(props.deviceStates?.wallbox, 0, MAX_WALLBOX),

  batteryCharging: props.deviceStates?.batteryCharging === true,
}));

const pendingDevices = reactive({
  heatpump: false,
  wallbox: false,
  batteryCharging: false,
});

const pendingTargetState = reactive({
  heatpump: null,
  wallbox: null,
  batteryCharging: null,
});

const hasPendingDevice = computed(
  () => pendingDevices.heatpump || pendingDevices.wallbox || pendingDevices.batteryCharging
);

const displayedState = computed(() => (prediction.value ? prediction.value.state : normalizedDeviceStates.value));

const resetPending = () => {
  for (const key of Object.keys(pendingDevices)) {
    pendingDevices[key] = false;
    pendingTargetState[key] = null;
  }
};

const markPendingChanges = state => {
  const current = normalizedDeviceStates.value;

  for (const key of Object.keys(pendingDevices)) {
    if (state?.[key] !== current[key]) {
      pendingDevices[key] = true;
      pendingTargetState[key] = state[key];
    }
  }
};

watch(
  normalizedDeviceStates,
  current => {
    for (const key of Object.keys(pendingDevices)) {
      if (pendingDevices[key] && current[key] === pendingTargetState[key]) {
        pendingDevices[key] = false;
        pendingTargetState[key] = null;
      }
    }
  },
  { deep: true }
);

/*
 * ============================================================
 * STATUS
 * ============================================================
 */

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
    return 'A device adjustment was selected. Waiting for the physical system to settle.';
  }

  return 'Automatic control is monitoring VUF.';
});

/*
 * ============================================================
 * COOLDOWN
 * ============================================================
 */

const cooldownRemaining = computed(() => {
  if (agentState.value !== 'adjusting') {
    return 0;
  }

  return Math.max(0, (cooldownUntil.value - now.value) / 1000);
});

const cooldownProgress = computed(() =>
  Math.max(0, Math.min(100, ((cooldownRemaining.value * 1000) / SETTLE_TIME_MS) * 100))
);

/*
 * ============================================================
 * LOGGING
 * ============================================================
 */

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
 * ============================================================
 * PREDICTION
 * ============================================================
 */

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

/*
 * ============================================================
 * STEP 1
 *
 * REDUCE EXISTING LOAD
 * ============================================================
 *
 * Only ONE device changes by ONE level.
 *
 * We only create reduction candidates that remain at or above
 * 50% of the device's maximum.
 *
 * Example:
 *
 * wallbox = 3
 *
 * candidate:
 * wallbox = 2
 *
 * 2 / 3 = 66.7%
 *
 * therefore allowed.
 *
 *
 * wallbox = 2
 *
 * candidate:
 * wallbox = 1
 *
 * 1 / 3 = 33.3%
 *
 * therefore NOT included here.
 */

const getReductionCandidates = current => {
  const candidates = [];

  /*
   * Heat pump: one level down.
   */
  if (current.heatpump > 0) {
    const nextLevel = current.heatpump - 1;

    const ratio = nextLevel / MAX_HEATPUMP;

    if (ratio >= MIN_LOAD_RATIO) {
      candidates.push({
        ...current,

        heatpump: nextLevel,
      });
    }
  }

  /*
   * Wallbox: one level down.
   */
  if (current.wallbox > 0) {
    const nextLevel = current.wallbox - 1;

    const ratio = nextLevel / MAX_WALLBOX;

    if (ratio >= MIN_LOAD_RATIO) {
      candidates.push({
        ...current,

        wallbox: nextLevel,
      });
    }
  }

  /*
   * Battery is binary.
   *
   * If battery charging is already active, turning it off is
   * considered a reduction.
   */
  if (current.batteryCharging) {
    candidates.push({
      ...current,

      batteryCharging: false,
    });
  }

  return candidates;
};

/*
 * ============================================================
 * STEP 2
 *
 * DETECT WHETHER THE NEXT REDUCTION WOULD CROSS 50%
 * ============================================================
 */

const hasBlockedReduction = current => {
  /*
   * Heat pump still has load, but its next step would go
   * below 50%.
   */
  if (current.heatpump > 0) {
    const nextLevel = current.heatpump - 1;

    if (nextLevel / MAX_HEATPUMP < MIN_LOAD_RATIO) {
      return true;
    }
  }

  /*
   * Same test for wallbox.
   */
  if (current.wallbox > 0) {
    const nextLevel = current.wallbox - 1;

    if (nextLevel / MAX_WALLBOX < MIN_LOAD_RATIO) {
      return true;
    }
  }

  return false;
};

/*
 * ============================================================
 * STEP 3
 *
 * COMPENSATE BY STARTING AN INACTIVE DEVICE
 * ============================================================
 *
 * Only one previously inactive device is started.
 *
 * Heat pump:
 * 0 -> 1
 *
 * Wallbox:
 * 0 -> 1
 *
 * Battery:
 * OFF -> ON
 */

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

/*
 * ============================================================
 * SELECT BEST SINGLE-STEP CANDIDATE
 * ============================================================
 *
 * We still use predicted VUF to decide WHICH one-step action
 * is most useful.
 *
 * But unlike the old exhaustive optimiser, the candidate set
 * itself is heavily restricted by the control policy.
 */

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

  /*
   * The candidate set already represents equivalent policy
   * actions (all are either one-step reductions or one-step
   * compensations), so predicted VUF is a sensible tie-breaker
   * here.
   */
  results.sort((a, b) => a.vuf - b.vuf);

  return results[0];
};

/*
 * ============================================================
 * CONTROL POLICY
 * ============================================================
 *
 * Priority:
 *
 * 1. Reduce an already-active load by ONE step.
 *
 * 2. Never perform that reduction if it would push the
 *    proportional device below 50% of maximum.
 *
 * 3. Once that boundary is reached, try starting ONE currently
 *    inactive device instead.
 *
 * 4. Wait five seconds after every physical action.
 *
 * 5. Then inspect estimated VUF again.
 */

const chooseNextAction = async () => {
  const current = {
    ...normalizedDeviceStates.value,
  };

  /*
   * --------------------------------------------------------
   * FIRST PRIORITY:
   * one-step reduction that remains >= 50%.
   * --------------------------------------------------------
   */

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

  /*
   * --------------------------------------------------------
   * SECOND PRIORITY:
   *
   * We have reached the point where another reduction would
   * push an active proportional device below 50%.
   *
   * Instead, introduce another controllable load.
   * --------------------------------------------------------
   */

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

  /*
   * No permitted action improved predicted VUF.
   *
   * Importantly, we DO NOT continue reducing below the 50%
   * boundary automatically.
   */
  return null;
};

/*
 * ============================================================
 * EXECUTE ONE CONTROL STEP
 * ============================================================
 */

const selectAndApplyState = async repeatedViolation => {
  if (!autoEnabled.value || evaluating.value) {
    return;
  }

  evaluating.value = true;

  try {
    addLog(
      repeatedViolation ? 'VUF still violated' : 'VUF violation detected',

      `Estimated VUF is ${formatVuf(props.vuf)}.`,

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
        'No one-step reduction or compensation action is predicted to improve VUF.',
        'warning'
      );

      return;
    }

    prediction.value = action;

    if (action.reason === 'reduce') {
      addLog(
        'Active load reduced',
        [
          `Heat pump ${action.state.heatpump}/5`,
          `Wallbox ${action.state.wallbox}/3`,
          `Battery ${action.state.batteryCharging ? 'ON' : 'OFF'}`,
          `Predicted VUF ${formatVuf(action.vuf)}`,
        ].join(' · '),
        'action'
      );
    } else {
      addLog(
        'Compensation device activated',
        [
          'Further reduction would cross the 50% load boundary.',
          `Heat pump ${action.state.heatpump}/5`,
          `Wallbox ${action.state.wallbox}/3`,
          `Battery ${action.state.batteryCharging ? 'ON' : 'OFF'}`,
          `Predicted VUF ${formatVuf(action.vuf)}`,
        ].join(' · '),
        'action'
      );
    }

    /*
     * Send exactly ONE new state and keep a visual pending marker until feedback catches up.
     */
    markPendingChanges(action.state);

    emit('apply-state', {
      ...action.state,
    });

    /*
     * Now stop making decisions for five seconds.
     */
    agentState.value = 'adjusting';

    cooldownUntil.value = Date.now() + SETTLE_TIME_MS;
  } finally {
    evaluating.value = false;
  }
};

/*
 * ============================================================
 * MAIN STATE MACHINE
 * ============================================================
 */

const evaluateAgent = async () => {
  now.value = Date.now();

  if (!autoEnabled.value || evaluating.value) {
    return;
  }

  const currentVuf = Number(props.vuf);

  if (!Number.isFinite(currentVuf)) {
    return;
  }

  /*
   * --------------------------------------------------------
   * ADJUSTING
   * --------------------------------------------------------
   */

  if (agentState.value === 'adjusting') {
    /*
     * Physical devices get a full five seconds.
     */
    if (now.value < cooldownUntil.value) {
      return;
    }

    /*
     * Five seconds have passed.
     *
     * Now use the latest estimated VUF.
     */
    if (currentVuf > CRITICAL_VUF) {
      await selectAndApplyState(true);

      return;
    }

    /*
     * VUF is back at/below 2%.
     */
    prediction.value = null;

    agentState.value = 'monitoring';

    addLog('VUF stabilized', `Estimated VUF is now ${formatVuf(currentVuf)}.`, 'success');

    addLog('Monitoring resumed', 'Waiting for the next VUF violation.', 'monitoring');

    return;
  }

  /*
   * --------------------------------------------------------
   * MONITORING
   * --------------------------------------------------------
   */

  agentState.value = 'monitoring';

  if (currentVuf > CRITICAL_VUF) {
    await selectAndApplyState(false);
  }
};

/*
 * ============================================================
 * AUTO ON / OFF
 * ============================================================
 */

const toggleAuto = () => {
  autoEnabled.value = !autoEnabled.value;

  emit('enabled-change', autoEnabled.value);

  prediction.value = null;
  resetPending();

  cooldownUntil.value = 0;

  if (autoEnabled.value) {
    agentState.value = 'monitoring';

    addLog('Monitoring started', 'Automatic VUF control enabled.', 'monitoring');

    /*
     * Immediately inspect current VUF.
     */
    evaluateAgent();

    return;
  }

  agentState.value = 'inactive';

  addLog('Agent inactive', 'Automatic VUF control disabled.', 'inactive');
};

/*
 * ============================================================
 * REACT TO VUF CHANGES
 * ============================================================
 */

watch(
  () => props.vuf,

  () => {
    /*
     * During the five-second settling period we deliberately
     * ignore incoming VUF changes.
     */
    if (autoEnabled.value && agentState.value === 'monitoring') {
      evaluateAgent();
    }
  }
);

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
    'Manual device state changed',
    [
      `Heat pump ${state.heatpump}/5`,
      `Wallbox ${state.wallbox}/3`,
      `Battery ${state.batteryCharging ? 'ON' : 'OFF'}`,
    ].join(' · '),
    'info'
  );
};

const requestHeatpumpZeroHold = () => {
  const state = {
    ...normalizedDeviceStates.value,
    heatpump: 0,
  };

  markPendingChanges(state);
  prediction.value = { state, vuf: Number(props.vuf) };
  emit('heatpump-zero-hold');

  addLog(
    'Heat pump ZERO_HOLD requested',
    'Manual ZERO_HOLD uses Branch-A start,0 and is intentionally different from OFF/STOP.',
    'info'
  );
};

/*
 * ============================================================
 * LIFECYCLE
 * ============================================================
 */

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
.cooldown-label,
.prediction,
.prediction-values {
  display: flex;
  align-items: center;
}
.header,
.section-head,
.device-head,
.cooldown-label,
.prediction {
  justify-content: space-between;
}
.header {
  align-items: flex-start;
  gap: 16px;
}
.eyebrow,
.panel-label {
  color: #6f9ab1;
  font-size: 10px;
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
  margin-top: 10px;
  font-size: 30px;
  font-weight: 900;
}
.thresholds,
.panel p,
.current-state {
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
.device-head {
  color: #87a9ba;
  font-size: 10px;
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
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  margin-top: 8px;
}
.segments.three {
  grid-template-columns: repeat(3, 1fr);
}
.level-button {
  height: 8px;

  padding: 0;

  border: 0;
  border-radius: 999px;

  background: #183547;

  cursor: pointer;

  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.level-button:hover:not(:disabled) {
  background: #28566e;

  transform: translateY(-1px);
}

.level-button.active {
  background: var(--cyan);

  box-shadow: 0 0 7px rgba(88, 231, 255, 0.25);
}

.level-button:disabled {
  cursor: default;

  opacity: 0.75;
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

.off-button:disabled {
  cursor: default;

  opacity: 0.5;
}

.binary.clickable {
  cursor: pointer;

  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.binary.clickable:hover:not(:disabled) {
  border-color: #3a6a80;
}

.binary.clickable:disabled {
  cursor: default;

  opacity: 0.75;
}
.binary {
  display: inline-block;
  margin-top: 10px;
  padding: 6px 10px;
  border: 1px solid #24495d;
  border-radius: 999px;
  color: #769bad;
  font-size: 11px;
  font-weight: 800;
}
.binary.on {
  border-color: #2b6f62;
  color: #8ff1c3;
  background: rgba(66, 227, 140, 0.08);
}
.current-state {
  margin-top: 7px;
}
.prediction {
  gap: 16px;
  margin-top: 12px;
  padding: 13px;
  border: 1px solid rgba(88, 231, 255, 0.27);
  border-radius: 14px;
  background: rgba(88, 231, 255, 0.04);
}
.prediction-title {
  margin-top: 4px;
  color: #93b5c5;
  font-size: 10px;
}
.prediction-values {
  gap: 10px;
  font-size: 18px;
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

.device.pending {
  border-color: #ffd166;
  box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.25), 0 0 20px rgba(255, 209, 102, 0.08);
}
.pending-badge,
.pending-note {
  color: #ffd166;
}
.pending-note {
  display: block;
  margin-top: -4px;
  margin-bottom: 8px;
  font-size: 10px;
  letter-spacing: .03em;
}
.zero-hold-button {
  margin-top: 6px;
  border-color: #365b70;
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
  .prediction {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
