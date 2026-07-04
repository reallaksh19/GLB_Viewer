# GLB-PCF Viewer

Standalone extraction of the source repo's Basic GLB-PCF viewer.

## What It Includes

- Local GLB, GLTF, and PCF loading.
- PCF-to-GLB conversion using the copied source viewer pipeline.
- Orbit, pan, zoom, fit, preset views, color-by metadata, clipping, selection, properties, layers, marquee zoom, and measurement.
- Bundled PCF and generated GLB mock loaders.

## Run Locally

```powershell
npm test
python -m http.server 8080
```

Open `http://localhost:8080/`.

## Deploy

The workflow at `.github/workflows/deploy.yml` publishes this static app to GitHub Pages. It has no build step; it uploads the repository root as the Pages artifact.
