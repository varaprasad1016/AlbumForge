/** Vector design library — shapes and clip-art graphics shared by the editor
 * (Konva) and the export pipeline (SVG rasterization / canvas). All art is
 * single-color so it can be tinted per element. */

export interface GraphicPath {
  d: string;
  mode?: "fill" | "stroke";
}

export interface GraphicDef {
  id: string;
  name: string;
  w: number;
  h: number;
  paths: GraphicPath[];
}

export const GRAPHICS: GraphicDef[] = [
[
  {
    "id": "corner_filigree",
    "name": "Ornate corner",
    "w": 120,
    "h": 120,
    "paths": [
      {
        "d": "M14 120 C14 56 56 14 120 14",
        "mode": "stroke"
      },
      {
        "d": "M36 120 C36 70 70 36 120 36",
        "mode": "stroke"
      },
      {
        "d": "M22 116 C16 112 14 104 14 96 C14 90 18 86 24 86 C28 86 30 89 29 92",
        "mode": "stroke"
      },
      {
        "d": "M116 22 C112 16 104 14 96 14 C90 14 86 18 86 24 C86 28 89 30 92 29",
        "mode": "stroke"
      },
      {
        "d": "M50 50 L58 50 L54 58 Z",
        "mode": "fill"
      },
      {
        "d": "M64 50 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M50 64 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "corner_floral",
    "name": "Floral corner",
    "w": 140,
    "h": 140,
    "paths": [
      {
        "d": "M8 140 C8 62 62 8 140 8",
        "mode": "stroke"
      },
      {
        "d": "M52.36 102.36 Q61.07 98.66 70.04 71.96 Q43.34 80.93 39.64 89.64 Z",
        "mode": "fill"
      },
      {
        "d": "M82.36 72.36 Q91.07 68.66 100.04 41.96 Q73.34 50.93 69.64 59.64 Z",
        "mode": "fill"
      },
      {
        "d": "M109.66 43.66 Q117.29 40.34 125.21 16.79 Q101.66 24.71 98.34 32.34 Z",
        "mode": "fill"
      },
      {
        "d": "M24.95 113.05 Q22.03 106.48 1.62 99.62 Q8.48 120.03 15.05 122.95 Z",
        "mode": "fill"
      },
      {
        "d": "M118 28 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M111.78 36.56 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M101.72 33.29 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M101.72 22.71 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M111.78 19.44 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M110 28 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M34 110 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M29.16 116.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M21.34 114.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M21.34 105.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M29.16 103.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M28 110 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "wreath",
    "name": "Laurel wreath",
    "w": 160,
    "h": 160,
    "paths": [
      {
        "d": "M80 20 a60 60 0 1 1 0 120 a60 60 0 1 1 0 -120 Z",
        "mode": "stroke"
      },
      {
        "d": "M144 87 Q149.16 87.37 164 80 Q149.16 72.63 144 73 Z",
        "mode": "fill"
      },
      {
        "d": "M140.01 103.33 Q144.9 105.02 161.14 101.74 Q148.71 90.78 143.63 89.8 Z",
        "mode": "fill"
      },
      {
        "d": "M131.93 118.06 Q136.21 120.97 152.75 122 Q143.58 108.2 138.93 105.94 Z",
        "mode": "fill"
      },
      {
        "d": "M120.31 130.2 Q123.69 134.12 139.4 139.4 Q134.12 123.69 130.2 120.31 Z",
        "mode": "fill"
      },
      {
        "d": "M105.94 138.93 Q108.2 143.58 122 152.75 Q120.97 136.21 118.06 131.93 Z",
        "mode": "fill"
      },
      {
        "d": "M89.8 143.63 Q90.78 148.71 101.74 161.14 Q105.02 144.9 103.33 140.01 Z",
        "mode": "fill"
      },
      {
        "d": "M73 144 Q72.63 149.16 80 164 Q87.37 149.16 87 144 Z",
        "mode": "fill"
      },
      {
        "d": "M56.67 140.01 Q54.98 144.9 58.26 161.14 Q69.22 148.71 70.2 143.63 Z",
        "mode": "fill"
      },
      {
        "d": "M41.94 131.93 Q39.03 136.21 38 152.75 Q51.8 143.58 54.06 138.93 Z",
        "mode": "fill"
      },
      {
        "d": "M29.8 120.31 Q25.88 123.69 20.6 139.4 Q36.31 134.12 39.69 130.2 Z",
        "mode": "fill"
      },
      {
        "d": "M21.07 105.94 Q16.42 108.2 7.25 122 Q23.79 120.97 28.07 118.06 Z",
        "mode": "fill"
      },
      {
        "d": "M16.37 89.8 Q11.29 90.78 -1.14 101.74 Q15.1 105.02 19.99 103.33 Z",
        "mode": "fill"
      },
      {
        "d": "M16 73 Q10.84 72.63 -4 80 Q10.84 87.37 16 87 Z",
        "mode": "fill"
      },
      {
        "d": "M19.99 56.67 Q15.1 54.98 -1.14 58.26 Q11.29 69.22 16.37 70.2 Z",
        "mode": "fill"
      },
      {
        "d": "M28.07 41.94 Q23.79 39.03 7.25 38 Q16.42 51.8 21.07 54.06 Z",
        "mode": "fill"
      },
      {
        "d": "M39.69 29.8 Q36.31 25.88 20.6 20.6 Q25.88 36.31 29.8 39.69 Z",
        "mode": "fill"
      },
      {
        "d": "M54.06 21.07 Q51.8 16.42 38 7.25 Q39.03 23.79 41.94 28.07 Z",
        "mode": "fill"
      },
      {
        "d": "M70.2 16.37 Q69.22 11.29 58.26 -1.14 Q54.98 15.1 56.67 19.99 Z",
        "mode": "fill"
      },
      {
        "d": "M87 16 Q87.37 10.84 80 -4 Q72.63 10.84 73 16 Z",
        "mode": "fill"
      },
      {
        "d": "M103.33 19.99 Q105.02 15.1 101.74 -1.14 Q90.78 11.29 89.8 16.37 Z",
        "mode": "fill"
      },
      {
        "d": "M118.06 28.07 Q120.97 23.79 122 7.25 Q108.2 16.42 105.94 21.07 Z",
        "mode": "fill"
      },
      {
        "d": "M130.2 39.69 Q134.12 36.31 139.4 20.6 Q123.69 25.88 120.31 29.8 Z",
        "mode": "fill"
      },
      {
        "d": "M138.93 54.06 Q143.58 51.8 152.75 38 Q136.21 39.03 131.93 41.94 Z",
        "mode": "fill"
      },
      {
        "d": "M143.63 70.2 Q148.71 69.22 161.14 58.26 Q144.9 54.98 140.01 56.67 Z",
        "mode": "fill"
      },
      {
        "d": "M130.22814296703154 93.45859034533107 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.76955262170048 116.76955262170047 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M93.45859034533107 130.22814296703154 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M66.54140965466891 130.22814296703154 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M43.23044737829953 116.76955262170048 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M29.771857032968455 93.45859034533109 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M29.77185703296844 66.54140965466894 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M43.23044737829952 43.23044737829953 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M66.54140965466893 29.771857032968448 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M93.4585903453311 29.771857032968455 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.76955262170046 43.23044737829952 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      },
      {
        "d": "M130.22814296703154 66.54140965466893 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "wreath_floral",
    "name": "Floral wreath",
    "w": 160,
    "h": 160,
    "paths": [
      {
        "d": "M80 22 a58 58 0 1 1 0 116 a58 58 0 1 1 0 -116 Z",
        "mode": "stroke"
      },
      {
        "d": "M144 86 Q148.65 86.64 162 80 Q148.65 73.36 144 74 Z",
        "mode": "fill"
      },
      {
        "d": "M132.43 117.2 Q136.13 120.07 151.01 121 Q142.77 108.58 138.43 106.8 Z",
        "mode": "fill"
      },
      {
        "d": "M106.8 138.43 Q108.58 142.77 121 151.01 Q120.07 136.13 117.2 132.43 Z",
        "mode": "fill"
      },
      {
        "d": "M74 144 Q73.36 148.65 80 162 Q86.64 148.65 86 144 Z",
        "mode": "fill"
      },
      {
        "d": "M42.8 132.43 Q39.93 136.13 39 151.01 Q51.42 142.77 53.2 138.43 Z",
        "mode": "fill"
      },
      {
        "d": "M21.57 106.8 Q17.23 108.58 8.99 121 Q23.87 120.07 27.57 117.2 Z",
        "mode": "fill"
      },
      {
        "d": "M16 74 Q11.35 73.36 -2 80 Q11.35 86.64 16 86 Z",
        "mode": "fill"
      },
      {
        "d": "M27.57 42.8 Q23.87 39.93 8.99 39 Q17.23 51.42 21.57 53.2 Z",
        "mode": "fill"
      },
      {
        "d": "M53.2 21.57 Q51.42 17.23 39 8.99 Q39.93 23.87 42.8 27.57 Z",
        "mode": "fill"
      },
      {
        "d": "M86 16 Q86.64 11.35 80 -2 Q73.36 11.35 74 16 Z",
        "mode": "fill"
      },
      {
        "d": "M117.2 27.57 Q120.07 23.87 121 8.99 Q108.58 17.23 106.8 21.57 Z",
        "mode": "fill"
      },
      {
        "d": "M138.43 53.2 Q142.77 51.42 151.01 39 Q136.13 39.93 132.43 42.8 Z",
        "mode": "fill"
      },
      {
        "d": "M129.03 106 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M124.2 112.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.37 110.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.37 101.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M124.2 99.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M123.03 106 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M84 132 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.16 138.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M71.34 136.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M71.34 127.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.16 125.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M78 132 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M38.97 106 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M34.13 112.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M26.3 110.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M26.3 101.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M34.13 99.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M32.97 106 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M38.97 54 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M34.13 60.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M26.3 58.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M26.3 49.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M34.13 47.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M32.97 54 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M84 28 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.16 34.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M71.34 32.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M71.34 23.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.16 21.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M78 28 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M129.03 54 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M124.2 60.66 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.37 58.11 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M116.37 49.89 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M124.2 47.34 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M123.03 54 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M86 80 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.78 88.56 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M69.72 85.29 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M69.72 74.71 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M79.78 71.44 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M78 80 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "mandala",
    "name": "Mandala",
    "w": 160,
    "h": 160,
    "paths": [
      {
        "d": "M80 4 a76 76 0 1 1 0 152 a76 76 0 1 1 0 -152 Z",
        "mode": "stroke"
      },
      {
        "d": "M80 16 a64 64 0 1 1 0 128 a64 64 0 1 1 0 -128 Z",
        "mode": "stroke"
      },
      {
        "d": "M107.8 76.6 Q144.0 70.0 154.0 80.0 Q164.0 90.0 107.8 83.4 Q100.0 80.0 107.8 76.6 Z",
        "mode": "fill"
      },
      {
        "d": "M105.8 90.9 Q134.1 107.0 144.1 117.0 Q154.1 127.0 102.4 96.9 Q97.3 90.0 105.8 90.9 Z",
        "mode": "fill"
      },
      {
        "d": "M96.9 102.4 Q107.0 134.1 117.0 144.1 Q127.0 154.1 90.9 105.8 Q90.0 97.3 96.9 102.4 Z",
        "mode": "fill"
      },
      {
        "d": "M83.4 107.8 Q70.0 144.0 80.0 154.0 Q90.0 164.0 76.6 107.8 Q80.0 100.0 83.4 107.8 Z",
        "mode": "fill"
      },
      {
        "d": "M69.1 105.8 Q33.0 134.1 43.0 144.1 Q53.0 154.1 63.1 102.4 Q70.0 97.3 69.1 105.8 Z",
        "mode": "fill"
      },
      {
        "d": "M57.6 96.9 Q5.9 107.0 15.9 117.0 Q25.9 127.0 54.2 90.9 Q62.7 90.0 57.6 96.9 Z",
        "mode": "fill"
      },
      {
        "d": "M52.2 83.4 Q-4.0 70.0 6.0 80.0 Q16.0 90.0 52.2 76.6 Q60.0 80.0 52.2 83.4 Z",
        "mode": "fill"
      },
      {
        "d": "M54.2 69.1 Q5.9 33.0 15.9 43.0 Q25.9 53.0 57.6 63.1 Q62.7 70.0 54.2 69.1 Z",
        "mode": "fill"
      },
      {
        "d": "M63.1 57.6 Q33.0 5.9 43.0 15.9 Q53.0 25.9 69.1 54.2 Q70.0 62.7 63.1 57.6 Z",
        "mode": "fill"
      },
      {
        "d": "M76.6 52.2 Q70.0 -4.0 80.0 6.0 Q90.0 16.0 83.4 52.2 Q80.0 60.0 76.6 52.2 Z",
        "mode": "fill"
      },
      {
        "d": "M90.9 54.2 Q107.0 5.9 117.0 15.9 Q127.0 25.9 96.9 57.6 Q90.0 62.7 90.9 54.2 Z",
        "mode": "fill"
      },
      {
        "d": "M102.4 63.1 Q134.1 33.0 144.1 43.0 Q154.1 53.0 105.8 69.1 Q97.3 70.0 102.4 63.1 Z",
        "mode": "fill"
      },
      {
        "d": "M166.0 80.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M154.5 123.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M123.0 154.5 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80.0 166.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M37.0 154.5 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M5.5 123.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M-6.0 80.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M5.5 37.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M37.0 5.5 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80.0 -6.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M123.0 5.5 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M154.5 37.0 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 70 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 Z",
        "mode": "stroke"
      }
    ]
  },
  {
    "id": "medallion",
    "name": "Medallion",
    "w": 140,
    "h": 140,
    "paths": [
      {
        "d": "M70 12 a58 58 0 1 1 0 116 a58 58 0 1 1 0 -116 Z",
        "mode": "stroke"
      },
      {
        "d": "M70 22 a48 48 0 1 1 0 96 a48 48 0 1 1 0 -96 Z",
        "mode": "stroke"
      },
      {
        "d": "M93.8 66.7 Q124.0 64.0 130.0 70.0 Q136.0 76.0 93.8 73.3 Z",
        "mode": "fill"
      },
      {
        "d": "M89.2 84.4 Q106.4 106.4 112.4 112.4 Q118.4 118.4 84.4 89.2 Z",
        "mode": "fill"
      },
      {
        "d": "M73.3 93.8 Q64.0 124.0 70.0 130.0 Q76.0 136.0 66.7 93.8 Z",
        "mode": "fill"
      },
      {
        "d": "M55.6 89.2 Q21.6 106.4 27.6 112.4 Q33.6 118.4 50.8 84.4 Z",
        "mode": "fill"
      },
      {
        "d": "M46.2 73.3 Q4.0 64.0 10.0 70.0 Q16.0 76.0 46.2 66.7 Z",
        "mode": "fill"
      },
      {
        "d": "M50.8 55.6 Q21.6 21.6 27.6 27.6 Q33.6 33.6 55.6 50.8 Z",
        "mode": "fill"
      },
      {
        "d": "M66.7 46.2 Q64.0 4.0 70.0 10.0 Q76.0 16.0 73.3 46.2 Z",
        "mode": "fill"
      },
      {
        "d": "M84.4 50.8 Q106.4 21.6 112.4 27.6 Q118.4 33.6 89.2 55.6 Z",
        "mode": "fill"
      },
      {
        "d": "M91.2 94.7 L94.7 91.2 L98.2 94.7 L94.7 98.2 Z",
        "mode": "fill"
      },
      {
        "d": "M41.8 94.7 L45.3 91.2 L48.8 94.7 L45.3 98.2 Z",
        "mode": "fill"
      },
      {
        "d": "M41.8 45.3 L45.3 41.8 L48.8 45.3 L45.3 48.8 Z",
        "mode": "fill"
      },
      {
        "d": "M91.2 45.3 L94.7 41.8 L98.2 45.3 L94.7 48.8 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "frame_oval",
    "name": "Oval frame",
    "w": 140,
    "h": 100,
    "paths": [
      {
        "d": "M70 8 a62 42 0 1 1 0 84 a62 42 0 1 1 0 -84 Z",
        "mode": "stroke"
      },
      {
        "d": "M70 20 a50 30 0 1 1 0 60 a50 30 0 1 1 0 -60 Z",
        "mode": "stroke"
      }
    ]
  },
  {
    "id": "frame_rect",
    "name": "Classic frame",
    "w": 120,
    "h": 90,
    "paths": [
      {
        "d": "M6 6 H114 V84 H6 Z",
        "mode": "stroke"
      },
      {
        "d": "M18 18 H102 V72 H18 Z",
        "mode": "stroke"
      },
      {
        "d": "M60 6 V18 M60 72 V84 M6 45 H18 M102 45 H114",
        "mode": "stroke"
      }
    ]
  },
  {
    "id": "divider_scroll",
    "name": "Scroll divider",
    "w": 240,
    "h": 60,
    "paths": [
      {
        "d": "M8 30 H96",
        "mode": "stroke"
      },
      {
        "d": "M144 30 H232",
        "mode": "stroke"
      },
      {
        "d": "M120 30 C110 22 98 22 92 30 C98 38 110 38 120 30 Z",
        "mode": "fill"
      },
      {
        "d": "M100 30 C100 40 96 46 88 48 C82 46 78 40 80 32 C82 26 90 24 96 28",
        "mode": "stroke"
      },
      {
        "d": "M140 30 C140 20 144 14 152 12 C158 14 162 20 160 28 C158 34 150 36 144 32",
        "mode": "stroke"
      },
      {
        "d": "M120 22 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M120 38 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "divider_floral",
    "name": "Floral divider",
    "w": 240,
    "h": 60,
    "paths": [
      {
        "d": "M10 30 C50 14 90 14 112 30",
        "mode": "stroke"
      },
      {
        "d": "M128 30 C150 14 190 14 230 30",
        "mode": "stroke"
      },
      {
        "d": "M55.36 26.5 Q59.86 22.86 64.14 5.15 Q47.44 12.44 44.64 17.5 Z",
        "mode": "fill"
      },
      {
        "d": "M77.86 22.6 Q82.69 20.33 89.32 5.14 Q73.22 9.03 70.14 13.4 Z",
        "mode": "fill"
      },
      {
        "d": "M171.86 13.4 Q168.78 9.03 152.68 5.14 Q159.31 20.33 164.14 22.6 Z",
        "mode": "fill"
      },
      {
        "d": "M197.36 17.5 Q194.56 12.44 177.86 5.15 Q182.14 22.86 186.64 26.5 Z",
        "mode": "fill"
      },
      {
        "d": "M127 28 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M120.09 37.51 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M108.91 33.88 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M108.91 22.12 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M120.09 18.49 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M118 28 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "monogram_luxe",
    "name": "Monogram frame",
    "w": 120,
    "h": 120,
    "paths": [
      {
        "d": "M60 8 a52 52 0 1 1 0 104 a52 52 0 1 1 0 -104 Z",
        "mode": "stroke"
      },
      {
        "d": "M60 18 a42 42 0 1 1 0 84 a42 42 0 1 1 0 -84 Z",
        "mode": "stroke"
      },
      {
        "d": "M89.9 93.9 L93.9 89.9 L97.9 93.9 L93.9 97.9 Z",
        "mode": "fill"
      },
      {
        "d": "M22.1 93.9 L26.1 89.9 L30.1 93.9 L26.1 97.9 Z",
        "mode": "fill"
      },
      {
        "d": "M22.1 26.1 L26.1 22.1 L30.1 26.1 L26.1 30.1 Z",
        "mode": "fill"
      },
      {
        "d": "M89.9 26.1 L93.9 22.1 L97.9 26.1 L93.9 30.1 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "swash_l",
    "name": "Calligraphic swashes",
    "w": 160,
    "h": 40,
    "paths": [
      {
        "d": "M6 24 C40 6 70 8 96 22 C112 30 126 32 154 26",
        "mode": "stroke"
      },
      {
        "d": "M96 22 C92 12 82 8 70 12 C66 14 66 20 70 24 C76 30 88 28 90 20",
        "mode": "stroke"
      },
      {
        "d": "M110 24 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M124 25 a2.5 2.5 0 1 1 5 0 a2.5 2.5 0 1 1 -5 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "swash_r",
    "name": "Swashes (mirror)",
    "w": 160,
    "h": 40,
    "paths": [
      {
        "d": "M154 24 C120 6 90 8 64 22 C48 30 34 32 6 26",
        "mode": "stroke"
      },
      {
        "d": "M64 22 C68 12 78 8 90 12 C94 14 94 20 90 24 C84 30 72 28 70 20",
        "mode": "stroke"
      },
      {
        "d": "M50 24 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M36 25 a2.5 2.5 0 1 1 5 0 a2.5 2.5 0 1 1 -5 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "flourish",
    "name": "Grand flourish",
    "w": 220,
    "h": 60,
    "paths": [
      {
        "d": "M6 30 C46 8 86 8 112 24 C138 40 178 40 214 18",
        "mode": "stroke"
      },
      {
        "d": "M112 24 C104 12 88 6 74 10 C66 13 64 20 70 25 C80 32 94 30 96 20",
        "mode": "stroke"
      },
      {
        "d": "M112 24 C120 36 136 42 150 38 C158 35 160 28 154 23 C144 16 130 18 128 28",
        "mode": "stroke"
      },
      {
        "d": "M126 24 a3.5 3.5 0 1 1 7 0 a3.5 3.5 0 1 1 -7 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "heart_vine",
    "name": "Heart with vines",
    "w": 140,
    "h": 120,
    "paths": [
      {
        "d": "M70 108 C30 84 6 62 6 36 C6 18 18 8 32 8 C44 8 56 16 70 34 C84 16 96 8 108 8 C122 8 134 18 134 36 C134 62 110 84 70 108 Z",
        "mode": "stroke"
      },
      {
        "d": "M70 40 C60 34 48 32 40 36 C44 44 56 48 66 46",
        "mode": "stroke"
      },
      {
        "d": "M70 40 C80 34 92 32 100 36 C96 44 84 48 74 46",
        "mode": "stroke"
      },
      {
        "d": "M29.2 23 Q31.17 19.37 32 6.14 Q20.96 13.47 18.8 17 Z",
        "mode": "fill"
      },
      {
        "d": "M121.2 17 Q119.04 13.47 108 6.14 Q108.83 19.37 110.8 23 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "lantern",
    "name": "Hanging lantern",
    "w": 116,
    "h": 140,
    "paths": [
      {
        "d": "M52 4 C52 0 64 0 64 4",
        "mode": "stroke"
      },
      {
        "d": "M58 8 a3.5 3.5 0 1 1 0 7 a3.5 3.5 0 1 1 0 -7 Z",
        "mode": "fill"
      },
      {
        "d": "M36 22 Q58 4 80 22 L80 26 Q58 44 36 26 Z",
        "mode": "fill"
      },
      {
        "d": "M30 36 L86 36 L82 98 Q58 112 34 98 Z",
        "mode": "stroke"
      },
      {
        "d": "M46 46 Q58 54 70 46",
        "mode": "stroke"
      },
      {
        "d": "M46 66 Q58 74 70 66",
        "mode": "stroke"
      },
      {
        "d": "M46 86 Q58 94 70 86",
        "mode": "stroke"
      },
      {
        "d": "M58 46 V94",
        "mode": "stroke"
      },
      {
        "d": "M50 104 L58 122 L66 104",
        "mode": "stroke"
      },
      {
        "d": "M58 122 L58 130",
        "mode": "stroke"
      },
      {
        "d": "M53 134 a5 5 0 1 1 10 0 a5 5 0 1 1 -10 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "peacock",
    "name": "Peacock",
    "w": 160,
    "h": 140,
    "paths": [
      {
        "d": "M80 128 C66 128 58 118 62 108 C66 100 76 98 80 104 C84 98 94 100 98 108 C102 118 94 128 80 128 Z",
        "mode": "fill"
      },
      {
        "d": "M80 104 L80 96",
        "mode": "stroke"
      },
      {
        "d": "M76 96 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q100.5 18 153.0 145.2",
        "mode": "stroke"
      },
      {
        "d": "M129.1 131.8 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q97.4 18 138.9 161.4",
        "mode": "stroke"
      },
      {
        "d": "M118.8 143.6 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q92.7 18 121.3 173.7",
        "mode": "stroke"
      },
      {
        "d": "M106.0 152.5 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q86.6 18 101.3 181.4",
        "mode": "stroke"
      },
      {
        "d": "M91.5 158.1 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q80.0 18 80.0 184.0",
        "mode": "stroke"
      },
      {
        "d": "M76.0 160.0 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q73.4 18 58.7 181.4",
        "mode": "stroke"
      },
      {
        "d": "M60.5 158.1 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q67.3 18 38.7 173.7",
        "mode": "stroke"
      },
      {
        "d": "M46.0 152.5 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q62.6 18 21.1 161.4",
        "mode": "stroke"
      },
      {
        "d": "M33.2 143.6 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M80 96 Q59.5 18 7.0 145.2",
        "mode": "stroke"
      },
      {
        "d": "M22.9 131.8 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "arch",
    "name": "Ornate arch",
    "w": 140,
    "h": 180,
    "paths": [
      {
        "d": "M22 178 V78 C22 34 46 20 70 20 C94 20 118 34 118 78 V178",
        "mode": "stroke"
      },
      {
        "d": "M36 178 V80 C36 44 54 34 70 34 C86 34 104 44 104 80 V178",
        "mode": "stroke"
      },
      {
        "d": "M40 52 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M52 52 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M64 52 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M76 52 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M88 52 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M26 178 V170 H114 V178",
        "mode": "stroke"
      },
      {
        "d": "M32 160 L38 160 L35 154 Z",
        "mode": "fill"
      },
      {
        "d": "M108 160 L102 160 L105 154 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "paisley",
    "name": "Paisley",
    "w": 100,
    "h": 140,
    "paths": [
      {
        "d": "M50 8 C78 8 94 28 94 62 C94 98 74 128 46 130 C30 131 18 120 18 104 C18 88 30 80 44 86 C58 92 62 106 52 114 C44 120 34 114 38 102",
        "mode": "stroke"
      },
      {
        "d": "M46 26 C62 26 74 40 74 62 C74 86 62 104 48 110",
        "mode": "stroke"
      },
      {
        "d": "M60 44 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0 Z",
        "mode": "fill"
      },
      {
        "d": "M52 70 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      },
      {
        "d": "M36 108 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "banner_scallop",
    "name": "Scalloped banner",
    "w": 240,
    "h": 56,
    "paths": [
      {
        "d": "M10 22 H230 L222 34 L230 46 H10 L18 34 Z",
        "mode": "fill"
      },
      {
        "d": "M36 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M64 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M92 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M120 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M148 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M176 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M204 10 a6 6 0 0 1 12 0",
        "mode": "stroke"
      },
      {
        "d": "M28 22 V46 M44 22 V46 M196 22 V46 M212 22 V46",
        "mode": "stroke"
      }
    ]
  },
  {
    "id": "divider_diamond",
    "name": "Diamond divider",
    "w": 200,
    "h": 28,
    "paths": [
      {
        "d": "M8 14 H86 M114 14 H192",
        "mode": "stroke"
      },
      {
        "d": "M100 6 L106 14 L100 22 L94 14 Z",
        "mode": "fill"
      },
      {
        "d": "M114 14 L116 16 L114 18 L112 16 Z",
        "mode": "fill"
      },
      {
        "d": "M86 14 L88 16 L86 18 L84 16 Z",
        "mode": "fill"
      }
    ]
  },
  {
    "id": "ring_seal",
    "name": "Seal ring",
    "w": 80,
    "h": 80,
    "paths": [
      {
        "d": "M40 12 a28 28 0 1 1 0 56 a28 28 0 1 1 0 -56 Z",
        "mode": "stroke"
      },
      {
        "d": "M40 24 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32 Z",
        "mode": "stroke"
      },
      {
        "d": "M40 4 V12 M40 68 V76 M12 40 H20 M60 40 H68",
        "mode": "stroke"
      }
    ]
  }
]
] as unknown as GraphicDef[];;;;



export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "star";

export interface ShapeStyle {
  shape: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
}

export interface GraphicStyle {
  graphicId?: string;
  color?: string;
  opacity?: number;
}

export function findGraphic(id: string | null | undefined): GraphicDef | undefined {
  if (!id) return undefined;
  return GRAPHICS.find((g) => g.id === id);
}

/** SVG markup for a graphic element (used by the export rasterizer). */
export function graphicSvg(
  graphicId: string,
  color: string,
  width: number,
  height: number,
  opacity = 1,
  strokeWidth = 2,
): string {
  const g = findGraphic(graphicId);
  if (!g) return "";
  const paths = g.paths
    .map((p) => {
      if (p.mode === "stroke") {
        return `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      return `<path d="${p.d}" fill="${color}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${g.w} ${g.h}" opacity="${opacity}">${paths}</svg>`;
}

/** SVG markup for a shape element. Rotation is baked around the element center. */
export function shapeSvg(style: ShapeStyle, width: number, height: number, rotationDeg = 0): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const fill = style.fill === "none" || !style.fill ? "none" : style.fill;
  const stroke = style.stroke && style.stroke !== "none" ? style.stroke : "#0f172a";
  const sw = Math.max(1, style.strokeWidth ?? 2);
  const op = style.opacity ?? 1;
  const rot = rotationDeg ? ` transform="rotate(${rotationDeg} ${w / 2} ${h / 2})"` : "";
  let body = "";
  if (style.shape === "ellipse") {
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - sw / 2}" ry="${h / 2 - sw / 2}"/>`;
  } else if (style.shape === "line") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><line x1="${sw / 2}" y1="${h / 2}" x2="${w - sw / 2}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/></svg>`;
  } else if (style.shape === "arrow") {
    const head = Math.min(14, h, w);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><line x1="${sw / 2}" y1="${h / 2}" x2="${w - head}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/><path d="M${w - head} ${h / 2 - head / 2} L${w - sw / 2} ${h / 2} L${w - head} ${h / 2 + head / 2} Z" fill="${stroke}" opacity="${op}"/></svg>`;
  } else if (style.shape === "star") {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - sw / 2;
    const rInner = rOuter * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    body = `<polygon points="${pts.join(" ")}"/>`;
  } else {
    const r = Math.min(style.radius ?? 0, w / 2, h / 2);
    body = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(1, w - sw)}" height="${Math.max(1, h - sw)}" rx="${r}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${rot}><g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}">${body}</g></svg>`;
}
