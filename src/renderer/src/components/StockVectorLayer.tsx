/**
 * StockVectorLayer — instances parsed vector data onto the Konva canvas.
 *
 * The native stock engine (and the custom-SVG pipeline) hand the editor
 * `StockVectorData` (the shared `parseSvg` output: width/height in the SVG's
 * own viewBox units + one path group per original fill colour). This is the
 * single "safe instance" path from that data to the canvas: every group is a
 * `<Path>` whose fill stays its own recolor slot, and the whole layer scales
 * by `(width/vector.width, height/vector.height)` to the element's normalised
 * box — non-destructive (original colours are never rewritten) and resolution
 * independent, exactly like the album-generation engine emits it.
 *
 * Rendering cost is deliberately low: path outlines are flattened by
 * `parseSvg` (svgpath transforms applied once at parse time) and Konva
 * re-draws only what the parent element group marks dirty.
 */
import type { StockVectorData } from "@shared/api";
import { Group, Path } from "react-konva";

interface StockVectorLayerProps {
  vector: StockVectorData;
  /** Element box width in stage pixels — drives the scale factor. */
  width: number;
  /** Element box height in stage pixels — drives the scale factor. */
  height: number;
}

export default function StockVectorLayer({ vector, width, height }: StockVectorLayerProps) {
  if (!vector || vector.groups.length === 0 || vector.width <= 0 || vector.height <= 0) {
    return null;
  }
  return (
    <Group scaleX={width / vector.width} scaleY={height / vector.height} listening={false}>
      {vector.groups.map((grp, gi) =>
        grp.paths.map((d, i) => (
          <Path
            key={`${gi}-${i}`}
            data={d}
            fill={grp.color}
            lineJoin="round"
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
        )),
      )}
    </Group>
  );
}
