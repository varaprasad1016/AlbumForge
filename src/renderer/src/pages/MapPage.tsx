import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@shared/api";

const CLUSTER_DEG = 0.02;

interface Cluster {
  lat: number;
  lng: number;
  items: GeoPoint[];
}

function clusterize(points: GeoPoint[]): Cluster[] {
  const map = new Map<string, Cluster>();
  for (const p of points) {
    const key = `${Math.round(p.latitude / CLUSTER_DEG)}:${Math.round(p.longitude / CLUSTER_DEG)}`;
    const c = map.get(key);
    if (c) {
      c.items.push(p);
      c.lat = (c.lat * (c.items.length - 1) + p.latitude) / c.items.length;
      c.lng = (c.lng * (c.items.length - 1) + p.longitude) / c.items.length;
    } else {
      map.set(key, { lat: p.latitude, lng: p.longitude, items: [p] });
    }
  }
  return Array.from(map.values());
}

export default function MapPage({ projectId }: { projectId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    window.albumforge.photos.geo(projectId).then((pts) => {
      setPoints(pts);
      setTotal(pts.length);
    });
  }, [projectId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { worldCopyJump: true });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.setView([20.59, 78.96], 5);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const clusters = clusterize(points);
    for (const c of clusters) {
      const radius = Math.min(24, 7 + c.items.length * 1.6);
      const marker = L.circleMarker([c.lat, c.lng], {
        radius,
        color: "#6366f1",
        weight: 1.5,
        fillColor: "#6366f1",
        fillOpacity: 0.35,
      });
      const first = c.items[0];
      const extra = c.items.length - 5;
      marker.bindPopup(
        `<div style="min-width:220px;font-family:system-ui,sans-serif">
           <p style="margin:0 0 6px;font-size:12px;color:#475569">${c.items.length} photo${c.items.length > 1 ? "s" : ""}</p>
           <div style="display:flex;gap:4px;flex-wrap:wrap">
             ${c.items
               .slice(0, 5)
               .map((p) => `<img src="media://thumb256/${p.id}" style="width:64px;height:64px;object-fit:cover;border-radius:6px" />`)
               .join("")}
           </div>
           ${extra > 0 ? `<p style="margin:6px 0 0;font-size:11px;color:#94a3b8">+ ${extra} more</p>` : ""}
           <p style="margin:6px 0 0;font-size:11px;color:#94a3b8">${first.filename}</p>
         </div>`,
      );
      marker.addTo(layer);
    }

    if (points.length >= 2) {
      L.polyline(
        points.map((p) => [p.latitude, p.longitude] as [number, number]),
        { color: "#818cf8", weight: 2, opacity: 0.65, dashArray: "6 6" },
      ).addTo(layer);
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [points]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Photo map</h1>
          <p className="text-sm text-slate-400">
            {total > 0
              ? `${total} geotagged photo${total > 1 ? "s" : ""} · clustered by location, route shown by timestamp`
              : "No geotagged photos in this project yet. Photos keep their GPS EXIF data at import."}
          </p>
        </div>
        <a href="#/projects" className="btn-secondary !px-3 !py-1">
          Back
        </a>
      </div>
      <div className="card overflow-hidden">
        <div ref={containerRef} className="h-[70vh] w-full" />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Coordinates are read from photo EXIF locally — nothing leaves this computer. Map tiles require an
        internet connection; points and routes still appear offline.
      </p>
    </div>
  );
}
