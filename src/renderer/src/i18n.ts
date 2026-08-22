import { useEffect, useState } from "react";

export type Lang = "en" | "fr" | "hi";

const STORAGE_KEY = "albumforge-lang";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    "nav.projects": "Projects",
    "nav.templates": "Templates",
    "nav.albums": "Albums",
    "nav.settings": "Settings",
    "nav.local": "Local · no cloud",
    "nav.dark": "Dark mode",
    "nav.light": "Light mode",
    "settings.updates": "Updates",
    "settings.check": "Check for updates",
    "settings.checking": "Checking…",
    "settings.uptodate": "You are up to date ✓",
    "settings.available": "Version v{version} is available",
    "settings.downloading": "Downloading update… {percent}%",
    "settings.download": "Download update",
    "settings.downloaded": "Update v{version} downloaded",
    "settings.install": "Install update",
    "settings.installHint": "Your device will ask you to confirm the installation.",
    "settings.allowUnknown": "Allow installs from AlbumForge in the system settings that just opened, then tap Install update again.",
    "settings.storage": "Storage",
    "settings.storageNote": "All data is stored locally on this device. Original photos are never uploaded.",
    "settings.clearCache": "Clear thumbnail cache",
    "settings.cleared": "Cleared ✓",
    "settings.appearance": "Appearance",
    "settings.darkMode": "Dark mode",
    "settings.darkModeHint": "Switch between light and dark themes",
    "settings.language": "Language",
    "settings.languageHint": "Interface language",
    "settings.about": "About",
    "settings.author": "Author",
    "settings.platform": "Platform",
    "settings.localPlatform": "Fully local · no cloud",
    "projects.createTitle": "Create your first project",
    "projects.name": "Project name (e.g. Wedding — John & Sarah)",
    "projects.client": "Client (optional)",
    "projects.create": "Create project",
    "projects.header": "Projects",
    "projects.delete": "Delete project",
    "project.import": "Import photos",
    "project.importing": "Importing…",
    "project.generate": "Generate albums",
    "project.generating": "Generating…",
    "project.groups": "Groups",
    "project.albums": "Albums",
    "project.map": "Map",
    "project.allPhotos": "All photos",
    "project.noPhotos": "No photos yet",
    "project.thumbnail": "Set as thumbnail",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.undo": "Undo",
    "common.redo": "Redo",
    "common.delete": "Delete",
    "common.add": "Add",
    "common.replace": "Replace",
    "common.addPhoto": "Add photo",
    "common.addText": "Add text",
    "common.background": "Background",
    "common.duplicate": "Duplicate",
    "common.back": "Back",
    "map.title": "Photo map",
    "map.hasPoints": "{count} geotagged photo{plural} · clustered by location, route shown by timestamp",
    "map.noPoints": "No geotagged photos in this project yet. Photos keep their GPS EXIF data at import.",
    "map.note": "Coordinates are read from photo EXIF locally — nothing leaves this computer. Map tiles require an internet connection; points and routes still appear offline.",
  },
  fr: {
    "nav.projects": "Projets",
    "nav.templates": "Modèles",
    "nav.albums": "Albums",
    "nav.settings": "Réglages",
    "nav.local": "Local · sans cloud",
    "nav.dark": "Mode sombre",
    "nav.light": "Mode clair",
    "settings.updates": "Mises à jour",
    "settings.check": "Vérifier les mises à jour",
    "settings.checking": "Vérification…",
    "settings.uptodate": "Vous êtes à jour ✓",
    "settings.available": "La version v{version} est disponible",
    "settings.downloading": "Téléchargement… {percent}%",
    "settings.download": "Télécharger",
    "settings.downloaded": "Mise à jour v{version} téléchargée",
    "settings.install": "Installer la mise à jour",
    "settings.installHint": "Votre appareil demandera une confirmation pour l'installation.",
    "settings.allowUnknown": "Autorisez les installations d'AlbumForge dans les réglages système qui viennent de s'ouvrir, puis retouchez Installer.",
    "settings.storage": "Stockage",
    "settings.storageNote": "Toutes les données restent sur cet appareil. Vos photos ne sont jamais envoyées.",
    "settings.clearCache": "Vider le cache des vignettes",
    "settings.cleared": "Vidé ✓",
    "settings.appearance": "Apparence",
    "settings.darkMode": "Mode sombre",
    "settings.darkModeHint": "Basculer entre thème clair et sombre",
    "settings.language": "Langue",
    "settings.languageHint": "Langue de l'interface",
    "settings.about": "À propos",
    "settings.author": "Auteur",
    "settings.platform": "Plateforme",
    "settings.localPlatform": "100% local · sans cloud",
    "projects.createTitle": "Créez votre premier projet",
    "projects.name": "Nom du projet (ex. Mariage — Jean & Marie)",
    "projects.client": "Client (optionnel)",
    "projects.create": "Créer le projet",
    "projects.header": "Projets",
    "projects.delete": "Supprimer le projet",
    "project.import": "Importer des photos",
    "project.importing": "Importation…",
    "project.generate": "Générer les albums",
    "project.generating": "Génération…",
    "project.groups": "Groupes",
    "project.albums": "Albums",
    "project.map": "Carte",
    "project.allPhotos": "Toutes les photos",
    "project.noPhotos": "Aucune photo",
    "project.thumbnail": "Définir comme vignette",
    "common.save": "Enregistrer",
    "common.saving": "Enregistrement…",
    "common.undo": "Annuler",
    "common.redo": "Rétablir",
    "common.delete": "Supprimer",
    "common.add": "Ajouter",
    "common.replace": "Remplacer",
    "common.addPhoto": "Ajouter une photo",
    "common.addText": "Ajouter du texte",
    "common.background": "Fond",
    "common.duplicate": "Dupliquer",
    "common.back": "Retour",
    "map.title": "Carte des photos",
    "map.hasPoints": "{count} photo{plural} géolocalisée{plural} · regroupées par lieu, tracé chronologique",
    "map.noPoints": "Aucune photo géolocalisée dans ce projet. Le GPS est lu depuis les données EXIF à l'import.",
    "map.note": "Les coordonnées sont lues localement depuis l'EXIF — rien ne quitte cet ordinateur. Les tuiles de carte nécessitent internet ; les points et tracés restent visibles hors ligne.",
  },
  hi: {
    "nav.projects": "प्रोजेक्ट्स",
    "nav.templates": "टेम्पलेट्स",
    "nav.albums": "एल्बम्स",
    "nav.settings": "सेटिंग्स",
    "nav.local": "लोकल · कोई क्लाउड नहीं",
    "nav.dark": "डार्क मोड",
    "nav.light": "लाइट मोड",
    "settings.updates": "अपडेट",
    "settings.check": "अपडेट जाँचें",
    "settings.checking": "जाँच हो रही है…",
    "settings.uptodate": "आप अपडेटेड हैं ✓",
    "settings.available": "संस्करण v{version} उपलब्ध है",
    "settings.downloading": "डाउनलोड हो रहा है… {percent}%",
    "settings.download": "अपडेट डाउनलोड करें",
    "settings.downloaded": "अपडेट v{version} डाउनलोड हो गया",
    "settings.install": "अपडेट इंस्टॉल करें",
    "settings.installHint": "इंस्टॉल की पुष्टि के लिए आपका डिवाइस पूछेगा।",
    "settings.allowUnknown": "खुले सिस्टम सेटिंग्स में AlbumForge से इंस्टॉल की अनुमति दें, फिर दोबारा इंस्टॉल करें।",
    "settings.storage": "स्टोरेज",
    "settings.storageNote": "सारा डेटा इसी डिवाइस पर रहता है। फ़ोटो कभी अपलोड नहीं होतीं।",
    "settings.clearCache": "थंबनेल कैश साफ़ करें",
    "settings.cleared": "साफ़ ✓",
    "settings.appearance": "दिखावट",
    "settings.darkMode": "डार्क मोड",
    "settings.darkModeHint": "लाइट और डार्क थीम बदलें",
    "settings.language": "भाषा",
    "settings.languageHint": "इंटरफ़ेस भाषा",
    "settings.about": "जानकारी",
    "settings.author": "लेखक",
    "settings.platform": "प्लेटफ़ॉर्म",
    "settings.localPlatform": "पूरी तरह लोकल · कोई क्लाउड नहीं",
    "projects.createTitle": "अपना पहला प्रोजेक्ट बनाएँ",
    "projects.name": "प्रोजेक्ट का नाम (जैसे शादी — राहुल & प्रिया)",
    "projects.client": "क्लाइंट (वैकल्पिक)",
    "projects.create": "प्रोजेक्ट बनाएँ",
    "projects.header": "प्रोजेक्ट्स",
    "projects.delete": "प्रोजेक्ट हटाएँ",
    "project.import": "फ़ोटो इम्पोर्ट करें",
    "project.importing": "इम्पोर्ट हो रहा है…",
    "project.generate": "एल्बम बनाएँ",
    "project.generating": "बन रहा है…",
    "project.groups": "समूह",
    "project.albums": "एल्बम्स",
    "project.map": "नक्शा",
    "project.allPhotos": "सभी फ़ोटो",
    "project.noPhotos": "अभी कोई फ़ोटो नहीं",
    "project.thumbnail": "थंबनेल बनाएँ",
    "common.save": "सेव करें",
    "common.saving": "सेव हो रहा है…",
    "common.undo": "पूर्ववत",
    "common.redo": "फिर से करें",
    "common.delete": "हटाएँ",
    "common.add": "जोड़ें",
    "common.replace": "बदलें",
    "common.addPhoto": "फ़ोटो जोड़ें",
    "common.addText": "टेक्स्ट जोड़ें",
    "common.background": "पृष्ठभूमि",
    "common.duplicate": "डुप्लिकेट",
    "common.back": "वापस",
    "map.title": "फ़ोटो का नक्शा",
    "map.hasPoints": "{count} जियोटैग की गई फ़ोटो{plural} · स्थान के अनुसार समूहित, समय के अनुसार मार्ग",
    "map.noPoints": "इस प्रोजेक्ट में अभी कोई जियोटैग की गई फ़ोटो नहीं। इम्पोर्ट पर GPS EXIF से पढ़ा जाता है।",
    "map.note": "निर्देशांक EXIF से लोकल पढ़े जाते हैं — कुछ भी कंप्यूटर से बाहर नहीं जाता। मैप टाइल्स के लिए इंटरनेट चाहिए; बिंदु और मार्ग ऑफ़लाइन भी दिखते हैं।",
  },
};

let current: Lang = detect();

const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "fr" || saved === "hi") return saved;
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("fr")) return "fr";
    if (nav.startsWith("hi")) return "hi";
  } catch {
    /* ignore */
  }
  return "en";
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  for (const cb of listeners) cb();
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

export function useLang(): Lang {
  const [lang, setLangState] = useState<Lang>(() => current);
  useEffect(() => {
    const cb = () => setLangState(current);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return lang;
}
