import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Close dropdowns when clicking outside
app.directive("click-outside", {
  mounted(el, binding) {
    el._clickOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) binding.value(e);
    };
    document.addEventListener("mousedown", el._clickOutside);
  },
  unmounted(el) {
    document.removeEventListener("mousedown", el._clickOutside);
  },
});

app.mount("#app");
