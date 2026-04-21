import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Ishtrak",
    description: "Git-native task automation for any project management platform",
    version: "0.1.0",
    permissions: [
      "nativeMessaging",
      "storage",
      "webRequest",
      "tabs",
      "scripting",
      "alarms",
    ],
    host_permissions: ["<all_urls>"],
  },
});
