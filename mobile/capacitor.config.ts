import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.albumforge.app",
  appName: "AlbumForge",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
