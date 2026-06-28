<script setup>
import { reactive, watch, onMounted } from 'vue';
import App from '../App.js';
import Card from './Card.vue';

const _ = reactive({
  count: 0,
  wallbox: {
    load: 0.5,
    r1: false,
    r2: false,
  },
});

const test = async () => {
  // const res = await App.SomeService.test('hello');
  const res = await App.EspService.wallbox('hello', 2);
  console.log(res);
};

const init = () => {
  watch(
    () => _.wallbox.r1,
    v => {
      App.EspService.wallbox(1, v);
    }
  );
  watch(
    () => _.wallbox.r2,
    v => {
      App.EspService.wallbox(2, v);
    }
  );

  App.EspService.on('update', data => {
    console.log(data);
  });
};

onMounted(init);
</script>

<template>
    <div class="container">
      <!-- Row 1: two cards -->

      <!-- Row 2: one card -->
      <div class="row" style="margin: 0 0 1em 0">
        <div class="col-12">
          <div class="title">
            <q-spinner-audio color="white" size="0.8em" style='margin-top:-0.3em;' />
            <q-spinner-audio color="white" size="0.8em" style='margin-top:-0.3em;margin-left:-0.2em' />
              SENERGATE
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-6">
          <Card>
            <q-card-section
              >Discovered Devices
              <q-input v-model="_.count" label="test" />
            </q-card-section>
          </Card>
        </div>

        <div class="col-12 col-sm-6">
          <Card>
            <q-card-section>
              <div class="text-h6">Discovered Devices</div>
            </q-card-section>

            <q-card-section class="q-pt-none">
              <q-list>
                <q-item>
                  <q-item-section side>
                    <q-icon color="secondary" name="heat_pump" size="3em" />
                  </q-item-section>
                  <q-item-section>
                    <q-slider v-model="_.count" :min="0" :max="3" label color="secondary" />
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section side>
                    <q-icon color="secondary" name="electric_car" size="3em" />
                  </q-item-section>
                  <q-item-section>
                    <q-linear-progress
                      rounded
                      size="1em"
                      stripe
                      :value="_.wallbox.load"
                      color="secondary"
                    />
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle v-model="_.wallbox.r1" color="secondary" />
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle v-model="_.wallbox.r2" color="secondary" />
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section side>
                    <q-icon color="secondary" name="battery_charging_full" size="3em" />
                  </q-item-section>
                  <q-item-section>
                    <q-slider v-model="_.count" :min="0" :max="10" label color="secondary" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </Card>
        </div>
      </div>

      <!-- Row 2: one card -->
      <div class="row q-col-gutter-md q-mt-md">
        <div class="col-12">
          <Card>
            <q-card-section>Card 3</q-card-section>
          </Card>
        </div>
      </div>

      <!-- Row 3: three cards -->
      <div class="row q-col-gutter-md q-mt-md">
        <div class="col-12 col-sm-4">
          <Card>
            <q-card-section>Card 4</q-card-section>
          </Card>
        </div>

        <div class="col-12 col-sm-4">
          <Card>
            <q-card-section>Card 5</q-card-section>
          </Card>
        </div>

        <div class="col-12 col-sm-4">
          <Card>
            <q-card-section>Card 6</q-card-section>
          </Card>
        </div>
      </div>
    </div>
</template>

<style scoped>
.text-h6 {
  /* text-transform: uppercase; */
}

.q-card__section {
  margin: 0;
  padding: 0;
}

.title {
  font-size: 2em;
  letter-spacing: 0.1em;
  padding: 0;
  margin: 0 0 0 0;
}

.container {
  max-width: 1024px;
  padding: 0;
  margin: 1em auto 0 auto;
  padding: 1.5em;
  border-radius: 1em;
  background-color: #0a1422;
  border: 1px solid #16344a;
}
</style>
