import { describe, expect, it } from "vitest";
import { mapFreepikResource, mapPixabayHit, mapUnsplashPhoto, parseSvg } from "./stock";

describe("parseSvg — recolourable vector extraction", () => {
  it("extracts paths bucketed by fill colour", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
        <path d="M0 0 L50 0 L50 50 Z" fill="#ff0000"/>
        <path d="M60 0 L100 0 L100 50 Z" fill="#0000ff"/>
      </svg>`);
    expect(v.width).toBe(200);
    expect(v.height).toBe(100);
    expect(v.groups).toHaveLength(2);
    const red = v.groups.find((g) => g.color === "#ff0000");
    const blue = v.groups.find((g) => g.color === "#0000ff");
    expect(red?.paths).toHaveLength(1);
    expect(blue?.paths).toHaveLength(1);
  });

  it("inherits fill from parent groups", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <g fill="#c9a227">
          <path d="M0 0 L10 0 L10 10 Z"/>
          <g>
            <path d="M20 0 L30 0 L30 10 Z"/>
          </g>
        </g>
      </svg>`);
    expect(v.groups).toHaveLength(1);
    expect(v.groups[0].color).toBe("#c9a227");
    expect(v.groups[0].paths).toHaveLength(2);
  });

  it("flattens group transforms into path data", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <g transform="translate(10, 20)">
          <path d="M0 0 L10 0 L10 10 Z" fill="#000"/>
        </g>
      </svg>`);
    const d = v.groups[0].paths[0];
    expect(d).toContain("M10 20"); // origin shifted by translate
  });

  it("treats stroke-only paths as a recolor slot", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M0 0 L50 50" fill="none" stroke="#123456"/>
      </svg>`);
    expect(v.groups).toHaveLength(1);
    expect(v.groups[0].color).toBe("#123456");
  });

  it("converts basic shapes to paths", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="10" fill="#0f0"/>
        <rect x="10" y="10" width="20" height="30" fill="#00f"/>
        <line x1="0" y1="0" x2="40" y2="40" stroke="#f00"/>
        <polygon points="0,60 10,60 5,70" fill="#ff0"/>
      </svg>`);
    const paths = v.groups.flatMap((g) => g.paths);
    expect(paths.length).toBe(4);
    expect(paths[0]).toMatch(/^M40 50/); // circle arcs
    expect(paths[1]).toMatch(/^M10 10/); // rect
  });

  it("skips defs/masks content and unparsable markup", () => {
    const v = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><path d="M0 0 L1 1 Z" fill="#abc"/></defs>
        <mask id="m"><rect x="0" y="0" width="10" height="10" fill="#fff"/></mask>
        <path d="M5 5 L50 5 L50 50 Z" fill="#111"/>
      </svg>`);
    expect(v.groups.flatMap((g) => g.paths)).toHaveLength(1);
    expect(v.groups[0].color).toBe("#111");
    expect(() => parseSvg("<html><body>not svg</body></html>")).toThrow();
  });

  it("falls back to width/height attributes when no viewBox", () => {
    const v = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <path d="M0 0 L5 0 L5 5 Z" fill="#000"/></svg>`);
    expect(v.width).toBe(320);
    expect(v.height).toBe(180);
  });
});

describe("mapFreepikResource", () => {
  const base = {
    id: 4242,
    title: "Gold mandala",
    type: "vector",
    is_premium: false,
    licenses: [{ name: "Free", is_premium: false, attribution_required: true }],
    image: {
      preview: { url: "https://img.freepik.com/p.jpg", width: 300, height: 300 },
      source: { url: "https://img.freepik.com/s.jpg", width: 1200, height: 1200 },
    },
    author: { name: "Artist", url: "https://freepik.com/author" },
  };

  it("maps a free vector resource", () => {
    const r = mapFreepikResource(base);
    expect(r).not.toBeNull();
    expect(r!.providerId).toBe("freepik-4242");
    expect(r!.kind).toBe("vector");
    expect(r!.sourceUrl).toBe("https://img.freepik.com/s.jpg");
    expect(r!.width).toBe(1200);
    expect(r!.attributionRequired).toBe(true);
    expect(r!.author).toBe("Artist");
  });

  it("maps photo resources to bitmap kind", () => {
    const r = mapFreepikResource({ ...base, type: "photo" });
    expect(r!.kind).toBe("bitmap");
  });

  it("drops premium resources", () => {
    expect(mapFreepikResource({ ...base, is_premium: true })).toBeNull();
    expect(mapFreepikResource({ ...base, licenses: [{ name: "Premium", is_premium: true }] })).toBeNull();
  });

  it("tolerates junk input", () => {
    expect(mapFreepikResource(null)).toBeNull();
    expect(mapFreepikResource("x")).toBeNull();
    expect(mapFreepikResource({})).not.toBeNull();
  });
});

describe("mapPixabayHit", () => {
  const hit = {
    id: 777,
    type: "vector",
    tags: "gold mandala, ornament, luxury",
    previewURL: "https://cdn.pixabay.com/photo/p.jpg",
    largeImageURL: "https://cdn.pixabay.com/photo/l.jpg",
    imageWidth: 1200,
    imageHeight: 900,
    user: "ArtistName",
  };

  it("maps a vector hit (ingests as transparent PNG bitmap)", () => {
    const r = mapPixabayHit(hit);
    expect(r).not.toBeNull();
    expect(r!.providerId).toBe("pixabay-777");
    expect(r!.provider).toBe("pixabay");
    expect(r!.kind).toBe("bitmap"); // Pixabay downloads are PNG, not SVG
    expect(r!.title).toBe("gold mandala"); // first tag
    expect(r!.width).toBe(1200);
    expect(r!.height).toBe(900);
    expect(r!.attributionRequired).toBe(false);
    expect(r!.author).toBe("ArtistName");
  });

  it("maps photo hits and tolerates junk", () => {
    expect(mapPixabayHit({ ...hit, type: "photo" })!.kind).toBe("bitmap");
    expect(mapPixabayHit(null)).toBeNull();
    expect(mapPixabayHit({ no_id: true })).toBeNull();
  });
});

describe("mapUnsplashPhoto", () => {
  const photo = {
    id: "abc123",
    alt_description: "gold silk fabric texture",
    width: 5000,
    height: 3333,
    urls: {
      raw: "https://images.unsplash.com/photo-1?ixlib=rb-4.0.3",
      full: "https://images.unsplash.com/photo-1?w=1080",
      small: "https://images.unsplash.com/photo-1?w=400",
    },
    user: { name: "Photographer Name" },
  };

  it("maps a photo with a clamped download URL and attribution", () => {
    const r = mapUnsplashPhoto(photo);
    expect(r).not.toBeNull();
    expect(r!.providerId).toBe("unsplash-abc123");
    expect(r!.provider).toBe("unsplash");
    expect(r!.kind).toBe("bitmap");
    expect(r!.title).toBe("gold silk fabric texture");
    expect(r!.sourceUrl).toContain("fm=jpg&fit=max&w=2400&q=85");
    expect(r!.width).toBe(5000);
    expect(r!.attributionRequired).toBe(true);
    expect(r!.author).toBe("Photographer Name");
  });

  it("tolerates junk input", () => {
    expect(mapUnsplashPhoto(null)).toBeNull();
    expect(mapUnsplashPhoto({ no_id: true })).toBeNull();
  });
});
