import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.yashlaser.yashflow",
  appName: "YashFlow",
  webDir: "www",
  server: {
    url: "https://app2.yashlaser.in",
    cleartext: false,
    androidScheme: "https"
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#1a2b4c"
  },
  plugins: {
    PushNotifications: {
      presentationOptions: []
    }
  }
};

export default config;
