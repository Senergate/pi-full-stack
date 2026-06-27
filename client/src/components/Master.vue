<script setup>
import { reactive } from 'vue';
import App from '../App.js';

const _ = reactive({
  count: 0,
});

const test = async () => {
  const res = await App.SomeService.test('hello');
  console.log(res);
};
</script>

<template>
  <q-btn :icon="App._.connected ? 'wifi' : 'wifi_off'" @click="test" />

  <q-btn icon="add_circle" @click="_.count++" />
  <b>{{ _.count }}</b>
</template>

<style scoped></style>
