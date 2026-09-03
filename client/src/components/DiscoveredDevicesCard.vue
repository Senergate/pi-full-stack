<script setup>
import Card from './Card.vue';
import App from '../App.js';

const props = defineProps({
  root: { type: Object, required: true },
});

const toggleBattery = () => {
  let state = props.root.battery.charging;
  props.root.battery.charging = null;
  App.BatteryService.set(!state);
};

const emit = defineEmits(['update:heatpumpLoad', 'update:count', 'toggle-wallbox']);
</script>

<template>
  <Card>
    <q-card-section><div class="text-h6 text-spaced text-uppercase">Discovered Devices</div></q-card-section>
    <q-card-section class="q-pt-none">
      <q-list>
        <q-expansion-item label="PHASE L1" caption="STATUS: OK" default-opened dense>
          <q-list
            ><q-item
              ><q-item-section side><q-icon color="secondary" name="heat_pump" size="3em" /></q-item-section
              ><q-item-section
                ><q-slider
                  :model-value="props.root.heatpump.load"
                  :min="0"
                  :max="5"
                  label
                  color="secondary"
                  track-size="12px"
                  @update:model-value="value => emit('update:heatpumpLoad', value)" /></q-item-section></q-item
          ></q-list>
        </q-expansion-item>
        <br />
        <q-expansion-item label="PHASE L2" caption="STATUS: OK" default-opened dense>
          <q-list>
            <q-item>
              <q-item-section side><q-icon color="secondary" name="electric_car" size="3em" /></q-item-section>
              <q-item-section>
                <q-linear-progress
                  rounded
                  size="1em"
                  stripe
                  :value="props.root.wallbox.load / 3"
                  color="secondary"
                  :indeterminate="props.root.wallbox.load < 0"
              /></q-item-section>
              <q-item-section side
                ><q-toggle
                  :model-value="props.root.wallbox.r0"
                  indeterminate-value="null"
                  color="secondary"
                  @update:model-value="() => emit('toggle-wallbox', 0)"
              /></q-item-section>
              <q-item-section side
                ><q-toggle
                  :model-value="props.root.wallbox.r1"
                  indeterminate-value="null"
                  color="secondary"
                  @update:model-value="() => emit('toggle-wallbox', 1)" /></q-item-section></q-item
          ></q-list>
        </q-expansion-item>
        <br />
        <q-expansion-item label="PHASE L3" caption="STATUS: OK" default-opened dense>
          <q-list
            ><q-item
              ><q-item-section side
                ><q-icon color="secondary" name="battery_charging_full" size="3em"
              /></q-item-section>
              <q-item-section>
                <q-linear-progress
                  rounded
                  size="1em"
                  stripe
                  :value="props.root.battery.load"
                  color="secondary"
              /></q-item-section>
              <q-item-section side
                ><q-toggle
                  :model-value="props.root.battery.charging"
                  indeterminate-value="null"
                  color="secondary"
                  @update:model-value="toggleBattery"
              /></q-item-section> </q-item
          ></q-list>
        </q-expansion-item>
      </q-list>
    </q-card-section>
  </Card>
</template>

<style scoped>
.text-spaced {
  letter-spacing: 0.2em;
}
.text-uppercase {
  text-transform: uppercase;
}
</style>
