import { contextBridge, ipcRenderer } from "electron";
import type { AlbumForgeApi, ImportProgress, UpdateEvent } from "@shared/api";

const api: AlbumForgeApi = {
  info: () => ipcRenderer.invoke("app:info"),
  openPath: (path) => ipcRenderer.invoke("app:openPath", path),
  clearCache: () => ipcRenderer.invoke("app:clearCache"),
  openDataFolder: () => ipcRenderer.invoke("app:openDataFolder"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
  onUpdateEvent: (cb) => {
    const listener = (_e: unknown, ev: UpdateEvent) => cb(ev);
    ipcRenderer.on("update:event", listener);
    return () => ipcRenderer.removeListener("update:event", listener);
  },
  dialogs: {
    chooseImages: () => ipcRenderer.invoke("dialogs:chooseImages"),
    chooseSavePath: (defaultName) => ipcRenderer.invoke("dialogs:chooseSavePath", defaultName),
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (input) => ipcRenderer.invoke("projects:create", input),
    get: (id) => ipcRenderer.invoke("projects:get", id),
    remove: (id) => ipcRenderer.invoke("projects:remove", id),
    setThumbnail: (projectId, photoId) => ipcRenderer.invoke("projects:setThumbnail", projectId, photoId),
  },
  photos: {
    importPhotos: (projectId, paths) => ipcRenderer.invoke("photos:import", projectId, paths),
    list: (projectId, opts) => ipcRenderer.invoke("photos:list", projectId, opts),
    geo: (projectId) => ipcRenderer.invoke("photos:geo", projectId),
    setSelected: (photoId, selected) => ipcRenderer.invoke("photos:setSelected", photoId, selected),
    remove: (photoId) => ipcRenderer.invoke("photos:remove", photoId),
    onImportProgress: (cb) => {
      const listener = (_e: unknown, p: ImportProgress) => cb(p);
      ipcRenderer.on("import:progress", listener);
      return () => ipcRenderer.removeListener("import:progress", listener);
    },
  },
  templates: {
    list: () => ipcRenderer.invoke("templates:list"),
    get: (id) => ipcRenderer.invoke("templates:get", id),
  },
  fonts: {
    list: () => ipcRenderer.invoke("fonts:list"),
  },
  groups: {
    auto: (projectId) => ipcRenderer.invoke("groups:auto", projectId),
    list: (projectId) => ipcRenderer.invoke("groups:list", projectId),
    create: (projectId, name) => ipcRenderer.invoke("groups:create", projectId, name),
    rename: (groupId, name) => ipcRenderer.invoke("groups:rename", groupId, name),
    remove: (groupId) => ipcRenderer.invoke("groups:remove", groupId),
    assign: (groupId, photoIds) => ipcRenderer.invoke("groups:assign", groupId, photoIds),
    merge: (projectId, groupIds, name) => ipcRenderer.invoke("groups:merge", projectId, groupIds, name),
    split: (projectId, groupId, photoIds, name) => ipcRenderer.invoke("groups:split", projectId, groupId, photoIds, name),
    clear: (projectId) => ipcRenderer.invoke("groups:clear", projectId),
  },
  albums: {
    list: (projectId) => ipcRenderer.invoke("albums:list", projectId),
    get: (id) => ipcRenderer.invoke("albums:get", id),
    generate: (input) => ipcRenderer.invoke("albums:generate", input),
    pages: (id) => ipcRenderer.invoke("albums:pages", id),
    recomposePage: (albumId, pageId, layoutKey) => ipcRenderer.invoke("albums:recomposePage", albumId, pageId, layoutKey),
    savePage: (albumId, pageId, update) => ipcRenderer.invoke("albums:savePage", albumId, pageId, update),
    addPage: (albumId) => ipcRenderer.invoke("albums:addPage", albumId),
    duplicatePage: (albumId, pageId) => ipcRenderer.invoke("albums:duplicatePage", albumId, pageId),
    deletePage: (albumId, pageId) => ipcRenderer.invoke("albums:deletePage", albumId, pageId),
    reorderPages: (albumId, pageIds) => ipcRenderer.invoke("albums:reorderPages", albumId, pageIds),
    versions: (id) => ipcRenderer.invoke("albums:versions", id),
    snapshot: (id) => ipcRenderer.invoke("albums:snapshot", id),
    restoreVersion: (albumId, versionId) => ipcRenderer.invoke("albums:restoreVersion", albumId, versionId),
  },
  exports: {
    create: (albumId, input) => ipcRenderer.invoke("exports:create", albumId, input),
    get: (id) => ipcRenderer.invoke("exports:get", id),
  },
};

contextBridge.exposeInMainWorld("albumforge", api);
