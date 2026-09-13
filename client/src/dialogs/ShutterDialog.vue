<script lang="ts" setup>
import { useDialogPluginComponent } from 'quasar';
import { ref, reactive, onMounted, onUnmounted } from 'vue';

import App from '../App.js';

const _ = reactive({
  shutters: []
});

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const updateShutterList = shutters => {
  shutters.forEach(s=>s.value=0);
  _.shutters = shutters;
};

const init = async () => {
  App.ShutterService.on('list',updateShutterList);
  App.ShutterService.requestList();
};

const destroy = async () => {
  App.ShutterService.off('list',updateShutterList);
};

onMounted(init);
onUnmounted(destroy)

const emergency = () => {
  App.ShutterService.emergency();
};
const activate = (id, direction) => {
  App.ShutterService.activate(id,direction);
};
</script>

<template>
  <q-dialog ref="dialogRef" backdrop-filter="blur(4px) grayscale(50%)" @hide="onDialogHide">
    <q-card flat style="border-radius: 1em; min-width: 20em">
      <q-card-section>
        <div style="text-align: center">
          <q-btn icon="warning" size="5em" rounded dense class="text-red-9" flat @click='emergency'/>
        </div>

        <q-list>
          <q-item v-for="s in _.shutters">
            <q-item-section side>
              <q-btn icon="keyboard_arrow_down" color="primary" dense @click="() => activate(s.id, 0)" />
            </q-item-section>
            <q-item-section style="width: 100%;text-align:center">
              {{ s.id }}
            </q-item-section>
            <q-item-section side>
              <q-btn icon="keyboard_arrow_up" color="primary" dense @click="() => activate(s.id, 1)" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-actions> </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped></style>
