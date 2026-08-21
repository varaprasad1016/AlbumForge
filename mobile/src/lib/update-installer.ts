/** TypeScript face of the local native UpdateInstaller plugin. */
import { registerPlugin } from "@capacitor/core";

export interface UpdateInstallerPlugin {
  downloadApk(options: { url: string; fileName: string }): Promise<{ path: string; size: number }>;
  installApk(options: { path: string }): Promise<{ needsPermission?: boolean }>;
  addListener(
    eventName: "downloadProgress",
    listener: (data: { percent: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const UpdateInstaller = registerPlugin<UpdateInstallerPlugin>("UpdateInstaller");
