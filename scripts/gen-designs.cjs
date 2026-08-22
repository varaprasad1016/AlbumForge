/** Assembles the graphics library JSON from parts and splices it into the two
 * designs.ts modules. */
const { writeFileSync, readFileSync } = require("fs");
const path = require("path");

const parts = [require("./gen-g1.cjs"), require("./gen-g2.cjs"), require("./gen-g3.cjs")];
const graphics = parts.flatMap((m) => m.build());

writeFileSync(path.join(__dirname, "graphics.json"), JSON.stringify(graphics, null, 2));

function splice(file) {
  const src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const startMarker = "export const GRAPHICS: GraphicDef[] =";
  const start = src.indexOf(startMarker);
  const typeIdx = src.indexOf("export type ShapeKind");
  if (start < 0 || typeIdx < 0) throw new Error(`markers not found in ${file}`);
  const end = src.lastIndexOf("]", typeIdx);
  if (end < 0) throw new Error(`array end not found in ${file}`);
  const head = src.slice(0, start + startMarker.length);
  const tail = src.slice(end + 1);
  const body = ` [\n${JSON.stringify(graphics, null, 2)}\n] as unknown as GraphicDef[];`;
  return head + body + tail;
}

const desktop = path.join(__dirname, "..", "src", "shared", "designs.ts");
const mobile = path.join(__dirname, "..", "mobile", "src", "lib", "designs.ts");
writeFileSync(desktop, splice(desktop));
writeFileSync(mobile, splice(desktop)); // identical module
console.log(`Wrote ${graphics.length} graphics to designs.ts (desktop + mobile)`);
