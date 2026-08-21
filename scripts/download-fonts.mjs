// Downloads a curated set of open-license fonts (Google Fonts repo, OFL) into
// resources/fonts for bundling with the app. Run: node scripts/download-fonts.mjs
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const FONTS = [
  ["Playfair Display", "ofl/playfairdisplay/PlayfairDisplay[wght].ttf"],
  ["Cormorant Garamond", "ofl/cormorantgaramond/CormorantGaramond[wght].ttf"],
  ["Lora", "ofl/lora/Lora[wght].ttf"],
  ["Merriweather", "ofl/merriweather/Merriweather[opsz,wdth,wght].ttf"],
  ["Prata", "ofl/prata/Prata-Regular.ttf"],
  ["Marcellus", "ofl/marcellus/Marcellus-Regular.ttf"],
  ["Cinzel", "ofl/cinzel/Cinzel[wght].ttf"],
  ["Cinzel Decorative", "ofl/cinzeldecorative/CinzelDecorative-Regular.ttf"],
  ["Abril Fatface", "ofl/abrilfatface/AbrilFatface-Regular.ttf"],
  ["Cormorant", "ofl/cormorant/Cormorant[wght].ttf"],
  ["Poppins", "ofl/poppins/Poppins-Regular.ttf"],
  ["Montserrat", "ofl/montserrat/Montserrat[wght].ttf"],
  ["Lato", "ofl/lato/Lato-Regular.ttf"],
  ["Raleway", "ofl/raleway/Raleway[wght].ttf"],
  ["Nunito", "ofl/nunito/Nunito[wght].ttf"],
  ["Quicksand", "ofl/quicksand/Quicksand[wght].ttf"],
  ["Josefin Sans", "ofl/josefinsans/JosefinSans[wght].ttf"],
  ["Inter", "ofl/inter/Inter[opsz,wght].ttf"],
  ["Great Vibes", "ofl/greatvibes/GreatVibes-Regular.ttf"],
  ["Dancing Script", "ofl/dancingscript/DancingScript[wght].ttf"],
  ["Pacifico", "ofl/pacifico/Pacifico-Regular.ttf"],
  ["Sacramento", "ofl/sacramento/Sacramento-Regular.ttf"],
  ["Parisienne", "ofl/parisienne/Parisienne-Regular.ttf"],
  ["Alex Brush", "ofl/alexbrush/AlexBrush-Regular.ttf"],
  ["Allura", "ofl/allura/Allura-Regular.ttf"],
  ["Tangerine", "ofl/tangerine/Tangerine-Regular.ttf"],
  ["Amatic SC", "ofl/amaticsc/AmaticSC-Regular.ttf"],
  ["Caveat", "ofl/caveat/Caveat[wght].ttf"],
  ["Shadows Into Light", "ofl/shadowsintolight/ShadowsIntoLight.ttf"],
  ["Kaushan Script", "ofl/kaushanscript/KaushanScript-Regular.ttf"],
  ["Bebas Neue", "ofl/bebasneue/BebasNeue-Regular.ttf"],
  ["Lobster", "ofl/lobster/Lobster-Regular.ttf"],
  ["Anton", "ofl/anton/Anton-Regular.ttf"],
  ["Space Mono", "ofl/spacemono/SpaceMono-Regular.ttf"],
  ["JetBrains Mono", "ofl/jetbrainsmono/JetBrainsMono[wght].ttf"],
  ["EB Garamond", "ofl/ebgaramond/EBGaramond[wght].ttf"],
  ["Work Sans", "ofl/worksans/WorkSans[wght].ttf"],
  ["Jost", "ofl/jost/Jost[wght].ttf"],
  ["Cardo", "ofl/cardo/Cardo-Regular.ttf"],
  ["Julius Sans One", "ofl/juliussansone/JuliusSansOne-Regular.ttf"],
  ["Petit Formal Script", "ofl/petitformalscript/PetitFormalScript-Regular.ttf"],
  ["Handlee", "ofl/handlee/Handlee-Regular.ttf"],
];

const BASE = "https://raw.githubusercontent.com/google/fonts/main/";
const outDir = join(process.cwd(), "resources", "fonts");
mkdirSync(outDir, { recursive: true });

let ok = 0;
let fail = 0;
const failed = [];

for (const [name, path] of FONTS) {
  const file = join(outDir, `${name}.ttf`);
  if (existsSync(file)) {
    console.log(`SKIP  ${name}`);
    ok++;
    continue;
  }
  try {
    const res = await fetch(BASE + path, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) throw new Error(`too small (${buf.length} bytes)`);
    writeFileSync(file, buf);
    console.log(`OK    ${name} (${buf.length} bytes)`);
    ok++;
  } catch (e) {
    console.log(`FAIL  ${name} — ${String(e)}`);
    fail++;
    failed.push([name, path]);
  }
}

console.log(`\nDone: ${ok} ok, ${fail} failed`);
if (failed.length) {
  console.log("Failed paths:");
  for (const [n, p] of failed) console.log(`  ${n} -> ${p}`);
}
