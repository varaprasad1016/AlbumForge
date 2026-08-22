/** Shared IPC contract between the main process and the renderer. */

export interface PageSize {
  width: number;
  height: number;
  unit: "mm" | "in";
}

export interface Project {
  id: string;
  name: string;
  clientName: string | null;
  eventDate: string | null;
  status: string;
  thumbnailPhotoId: string | null;
  createdAt: string;
}

export interface Photo {
  id: string;
  projectId: string;
  filename: string;
  width: number | null;
  height: number | null;
  orientation: string | null;
  fileSize: number | null;
  qualityScore: number | null;
  blurScore: number | null;
  faceCount: number;
  processingStatus: string;
  selected: boolean;
  groupId: string | null;
  createdAt: string;
}

export interface PhotoGroup {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  photoCount: number;
}

export interface SlotDef {
  x: number;
  y: number;
  w: number;
  h: number;
  orientationHint: string;
  bleed: boolean;
}

export interface TemplateLayout {
  id: string;
  key: string;
  name: string;
  slots: SlotDef[];
  weight: number;
  maxPhotos: number;
  sortOrder: number;
}

export interface TemplateSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  style: Record<string, unknown>;
  layouts: TemplateLayout[];
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumElement {
  id: string;
  type: "image" | "text" | "background" | "shape" | "graphic";
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  photoId: string | null;
  crop: CropRect | null;
  text: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
}

export interface AlbumPage {
  id: string;
  index: number;
  layoutKey: string | null;
  isSpread: boolean;
  background: Record<string, unknown> | null;
  elements: AlbumElement[];
}

export interface Album {
  id: string;
  projectId: string;
  templateId: string | null;
  name: string;
  pageSize: PageSize;
  pageCount: number;
  variationNumber: number;
  status: string;
  createdAt: string;
}

export interface AlbumVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  projectId: string;
  albumId: string | null;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
}

export interface ExportJob {
  id: string;
  albumId: string;
  kind: string;
  status: string;
  filePath: string | null;
  error: string | null;
  createdAt: string;
}

export interface LabPreset {
  id: string;
  name: string;
  description: string;
  dpi: number;
  bleedMm: number;
  colorMode: "rgb" | "cmyk";
}

export const LAB_PRESETS: LabPreset[] = [
  {
    id: "silver_rgb",
    name: "Silver-halide lab (RGB)",
    description: "300 DPI RGB — the standard profile for silver-halide flush-mount labs.",
    dpi: 300,
    bleedMm: 3,
    colorMode: "rgb",
  },
  {
    id: "cmyk_press",
    name: "Offset press (CMYK)",
    description: "300 DPI for press labs — CMYK conversion note included in the package manifest.",
    dpi: 300,
    bleedMm: 3,
    colorMode: "cmyk",
  },
  {
    id: "flush_square",
    name: "Flush-mount (2 mm bleed)",
    description: "300 DPI with tight 2 mm bleed for square flush-mount books.",
    dpi: 300,
    bleedMm: 2,
    colorMode: "rgb",
  },
  {
    id: "quick_proof",
    name: "Quick proof",
    description: "150 DPI draft for fast client review.",
    dpi: 150,
    bleedMm: 0,
    colorMode: "rgb",
  },
  {
    id: "ultra_600",
    name: "Ultra high-res (600 DPI)",
    description: "600 DPI for large-format and fine-art reproduction.",
    dpi: 600,
    bleedMm: 3,
    colorMode: "rgb",
  },
];

export interface AppInfo {
  version: string;
  author: string;
  dataPath: string;
  cachePath: string;
}

export type UpdateEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface ImportProgress {
  current: number;
  total: number;
  filename: string;
  status: "analyzing" | "done" | "error";
}

export interface ImportResult {
  imported: number;
  failed: number;
}

export interface GeoPoint {
  id: string;
  filename: string;
  latitude: number;
  longitude: number;
  takenAt: string | null;
}

export interface GenerateInput {
  projectId: string;
  templateId: string;
  pageCount: number;
  pageSize: PageSize;
  selection: "all" | "selected" | "ai";
  targetPhotoCount?: number | null;
  variations: number;
}

export interface PageUpdate {
  layoutKey?: string | null;
  background?: Record<string, unknown> | null;
  elements?: Array<{
    type: "image" | "text" | "background" | "shape" | "graphic";
    z: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    photoId: string | null;
    crop: CropRect | null;
    text: Record<string, unknown> | null;
    style: Record<string, unknown> | null;
  }>;
}

export interface AlbumForgeApi {
  info(): Promise<AppInfo>;
  openPath(path: string): Promise<void>;
  clearCache(): Promise<void>;
  openDataFolder(): Promise<void>;
  checkForUpdates(): Promise<string>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateEvent(cb: (e: UpdateEvent) => void): () => void;
  assets: {
    url(kind: string, id: string): Promise<string>;
    font(family: string): Promise<string>;
  };
  dialogs: {
    chooseImages(): Promise<File[] | null>;
    chooseSavePath(defaultName: string): Promise<string | null>;
  };
  projects: {
    list(): Promise<Project[]>;
    create(input: { name: string; clientName?: string; eventDate?: string }): Promise<Project>;
    get(id: string): Promise<Project>;
    remove(id: string): Promise<void>;
    setThumbnail(projectId: string, photoId: string): Promise<void>;
  };
  photos: {
    importPhotos(projectId: string, files: File[]): Promise<ImportResult>;
    list(
      projectId: string,
      opts: { offset: number; limit: number; selected?: boolean; status?: string; groupId?: string },
    ): Promise<{ items: Photo[]; total: number }>;
    geo(projectId: string): Promise<GeoPoint[]>;
    setSelected(photoId: string, selected: boolean): Promise<void>;
    remove(photoId: string): Promise<void>;
    onImportProgress(cb: (p: ImportProgress) => void): () => void;
  };
  groups: {
    auto(projectId: string): Promise<PhotoGroup[]>;
    list(projectId: string): Promise<PhotoGroup[]>;
    create(projectId: string, name: string): Promise<PhotoGroup>;
    rename(groupId: string, name: string): Promise<void>;
    remove(groupId: string): Promise<void>;
    assign(groupId: string, photoIds: string[]): Promise<void>;
    merge(projectId: string, groupIds: string[], name: string): Promise<PhotoGroup>;
    split(projectId: string, groupId: string, photoIds: string[], name: string): Promise<PhotoGroup>;
    clear(projectId: string): Promise<void>;
  };
  templates: {
    list(): Promise<TemplateSummary[]>;
    get(id: string): Promise<TemplateDetail>;
  };
  fonts: {
    list(): Promise<string[]>;
  };
  albums: {
    list(projectId?: string): Promise<Album[]>;
    get(id: string): Promise<Album>;
    generate(input: GenerateInput): Promise<Album[]>;
    pages(id: string): Promise<AlbumPage[]>;
    recomposePage(albumId: string, pageId: string, layoutKey: string): Promise<AlbumPage>;
    savePage(albumId: string, pageId: string, update: PageUpdate): Promise<AlbumPage>;
    addPage(albumId: string): Promise<AlbumPage>;
    duplicatePage(albumId: string, pageId: string): Promise<AlbumPage>;
    deletePage(albumId: string, pageId: string): Promise<void>;
    reorderPages(albumId: string, pageIds: string[]): Promise<void>;
    versions(id: string): Promise<AlbumVersion[]>;
    snapshot(id: string): Promise<AlbumVersion>;
    restoreVersion(albumId: string, versionId: string): Promise<AlbumPage[]>;
  };
  exports: {
    create(
      albumId: string,
      input: {
        kind: string;
        dpi: number;
        bleedMm: number;
        colorMode?: "rgb" | "cmyk";
        presetId?: string | null;
        targetPath?: string | null;
      },
    ): Promise<ExportJob>;
    get(id: string): Promise<ExportJob>;
  };
}
