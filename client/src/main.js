import { createApp } from 'vue';
import { Quasar, Dialog } from 'quasar';

// Import icon libraries
import '@quasar/extras/material-icons/material-icons.css';
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css';
import '@quasar/extras/material-icons-round/material-icons-round.css';
import '@quasar/extras/material-icons-sharp/material-icons-sharp.css';
import '@quasar/extras/material-symbols-outlined/material-symbols-outlined.css';
import '@quasar/extras/material-symbols-rounded/material-symbols-rounded.css';
import '@quasar/extras/material-symbols-sharp/material-symbols-sharp.css';

// Import Quasar css
import 'quasar/src/css/index.sass';

// Assumes your root component is App.vue
// and placed in same folder as main.js
import App from './App.vue';

const myApp = createApp(App);

myApp.use(Quasar, {
  plugins: {Dialog}, // import Quasar plugins and add here
});

// Assumes you have a <div id="app"></div> in your index.html
myApp.mount('#app');
