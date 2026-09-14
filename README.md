# mrad Reticle (iPhone prototype)

Phone-camera FFP-style milliradian reticle PWA. No spotting scope required.

## Use on iPhone
1. Open the HTTPS tunnel URL in **Safari** (not Chrome).
2. Tap **Allow Camera & Start**.
3. Optional: Share → **Add to Home Screen**.
4. **Calibrate**: known target size + distance, then pick top and bottom of that target.
5. Zoom with the slider. Reticle scales FFP-style with digital zoom.
6. **Measure**: pick two points → Δmrad; enter range for size.

## Local
```bash
python3 server.py
# http://localhost:8787
```

Camera requires a secure context (HTTPS or localhost).
