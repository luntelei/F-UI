import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import './style.css';
import '@/i18n';

createApp(App).use(ElementPlus).use(router).mount('#app');
