<script lang="ts" setup>
import { useDialogPluginComponent } from 'quasar';
import { ref, reactive, onMounted } from 'vue';

import App from '../App.js';

const _ = reactive({
  state: null,
});

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const init = async () => {
  _.state = await App.LockService.getState();
  console.log(_.state);
  App.LockService.on('update', state => {
    _.state = state;
  });
};

onMounted(init);

const set = lock => {
  if (!_.state.connected) return;
  if (lock) _.state.state === 3 && App.LockService.lock();
  else App.LockService.unlock();
};
</script>

<template>
  <q-dialog ref="dialogRef" backdrop-filter="blur(4px) grayscale(50%)" @hide="onDialogHide">
    <q-card v-if="_.state !== null" flat style="border-radius: 1em">
      <q-card-section>
        <q-icon
          :name="
            _.state.state === 3 ? 'sym_o_lock_open_right' : _.state.state === 1 ? 'sym_o_lock' : 'sym_o_lock_reset'
          "
          size="10em"
          style="color: #00aaff"
        />
      </q-card-section>

      <q-card-actions>
        <q-btn flat style="font-weight: bold" @click="() => set(true)">Lock</q-btn>
        <q-btn flat style="font-weight: bold" @click="() => set(false)">Unlock</q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped></style>
