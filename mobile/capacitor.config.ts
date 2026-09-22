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
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#1a2b4c",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false
    }
  }
};

export default config;
