# Qalla Wanan — R14 Money Heist RTL Map Labels

This package keeps the application UI typography unchanged (`Vazirmatn` / `Noto Kufi Arabic`) and uses the user-provided `UniQAIDAR-Money-Heist-002.ttf` only for native MapLibre place labels.

## Included behavior

- Satellite-only basemap with the Kurdistan outside mask
- Native MapLibre labels for all 69,000 source-backed records
- Native GPS marker, accuracy layer and route line
- Fixed geographic coordinates during zoom and pan
- NFC-normalized Kurdish/Arabic display names and RTL plugin shaping
- Compact dark capsules with category-aware label sizing

## Font installation

The font binary is not bundled in this ZIP. Put this file in Android Downloads before running the installer:

`UniQAIDAR-Money-Heist-002.ttf`

`TERMUX_INSTALL_R14_AND_PUSH.sh` copies it to `public/fonts/`, verifies it is non-empty, builds the project, confirms the generated copy in `dist/fonts/`, and pushes only to `sarhang-cs/qalla-wanan`.
