# Third-party notices and data scope

- Map rendering: MapLibre GL JS 5.24.0, loaded from jsDelivr, under its published open-source license.
- Right-to-left shaping: `@mapbox/mapbox-gl-rtl-text` 0.3.0, loaded from unpkg and used through MapLibre's official RTL plugin API.
- Legacy detail mini-maps retained from the original UI: Leaflet 1.9.4.
- Satellite imagery: Esri World Imagery. Provider attribution remains visible. Native requests are capped at z17 and overzoomed by MapLibre at deeper zooms.
- 3D terrain: MapTiler terrain-rgb-v2 when `VITE_MAPTILER_KEY` is configured.
- Routing test endpoint: OSRM-compatible endpoint configured through `VITE_ROUTING_BASE_URL`.
- Geographic names and operational boundary: derived from the supplied NAV KURD source package, whose metadata references OpenStreetMap/Geofabrik, GeoNames and Iraq COD-AB sources.

The included Kurdistan boundary is an operational application/data-coverage boundary. It is not a legal, political, cadastral, governmental, or surveying certification.
