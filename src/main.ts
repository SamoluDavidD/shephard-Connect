import { createApp } from "vue"
import Root from "./Root.vue"
import router from "./router"
import "./index.css"

createApp(Root).use(router).mount("#root")
