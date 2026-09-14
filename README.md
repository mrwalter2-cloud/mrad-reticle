# mrad Reticle

Phone-camera **first-focal-plane (FFP)** milliradian reticle for an iPhone. You zoom with the phone and read angular size in **mrad**, the same way you would on an FFP riflescope. No spotting scope required.

**This is an angular estimate only. It is not a surveyed optic.** Do not treat it as a substitute for a calibrated riflescope, a known-distance range, or a certified measuring tool.

---

## Install on iPhone (Safari)

Chrome and other iOS browsers do not install Home Screen web apps the same way. Use **Safari**.

1. Open this site in **Safari** (https). Camera will not work on plain `http` except `localhost`.
2. Tap **Allow Camera & Start**. If iOS asks for Camera access, allow it.
3. Tap the **Share** button (square with an arrow).
4. Scroll and tap **Add to Home Screen**, then **Add**.
5. Open **mrad** from the Home Screen. It runs full-screen.

The app shell works **offline** after the first load. The camera still needs the phone.

**Keep Awake** (if your iOS version supports it) reduces the screen sleeping on the firing line. You can also set Auto-Lock to Never while you shoot, then set it back.

---

## Calibrate (do this before you trust a number)

The reticle is **visual only** until you calibrate. The amber **Not calibrated** chip stays up until a profile is loaded or a new calibration is finished.

You need:

- A target of **known height** (steel plate, IPSC, a yardstick, a measured brick)
- A **known distance** to that target (range flag, rangefinder, or a taped-off 100 yd/m)

Steps:

1. Tap **Calibrate**.
2. Enter the known height and the distance. The app shows the expected milliradian size (`1000 × size ÷ distance`). Example: a **12 inch** plate at **100 yards** is **3.33 mrad** (because 1 mil at 100 yd is 3.6 inches).
3. Tap **Next: mark target**, then **Start marking**.
4. Tap the **top** of the known height, then the **bottom**. The sheet hides so you can see the camera. Use **Undo** if a tap is off.
5. Check the result (`px/mrad at 1×`). Name the profile (for example `iPhone rear`) and **Save profile**, or use it without saving.

**Save / load / delete:** profiles live only on this iPhone (no account, no cloud). Load a saved profile from the list. Delete one you no longer want. Recalibrate if you switch phones, flip to the front camera, add a case/lens, or change orientation (portrait vs landscape crops the camera differently).

---

## Measure

1. Tap **Measure** → **Pick 2 points**.
2. Tap two edges of what you want to size.
3. Read **Δ mrad**. Optional **MOA** is in Reticle / Measure (`1 mrad ≈ 3.44 MOA`).
4. Enter a **range** (yards or meters) to estimate physical size in **inches and cm**.

Size formula: `size = (mrad / 1000) × range`.

---

## How FFP zoom works

On an FFP scope the reticle grows with magnification so a 1 mil hash still subtends 1 mil at any zoom.

This app stores **pixels per milliradian at 1×**. At zoom `Z` the overlay uses `px/mrad × Z`. You can calibrate at 2× and measure at 4×; the angular reading stays consistent as long as the same camera and digital/native zoom path are used.

### Native zoom vs digital zoom on iOS Safari (honest)

| What you might expect | What Safari actually does |
| --- | --- |
| Camera app 0.5× / 1× / 2× / 3× / 5× lenses | A web page almost never gets those extra cameras. `getUserMedia` is usually the **wide (1×)** camera. |
| Optical / native zoom slider | iOS Safari typically **does not** expose `MediaTrackCapabilities.zoom`. When it does not, this app uses **digital zoom**: the video is enlarged on screen (CSS scale). |
| Digital zoom quality | Fine for moderate zoom. Past about **4×** the picture is soft (pixels, not glass). Prefer measuring at 2–4× after a good calibration. |
| Native zoom (rare) | If the browser reports a zoom capability (more common on some Android devices), the app applies that instead of CSS scale and labels the HUD **native**. FFP math is the same: stored at 1×, scaled by current zoom. |

Do **not** pinch-zoom the Safari page. Use the in-app **− / +** slider. Page zoom is locked so it cannot fight the reticle.

Demo mode (no camera) uses a painted 12″ @ 100 yd plate and a built-in `40 px/mrad @ 1×` profile so you can practice the wizard and FFP scaling on a desktop.

---

## Reticle styles

- **Hash / holdover tree** — ticks plus a simple holdover tree below center
- **Mil-dot** — dots on the integer mils
- **Cross + ticks** — stadia only

Colors, opacity, and 0.5 / 1.0 mrad major ticks are in **Reticle**. Landscape and portrait both work; controls sit in the safe area (notch / home indicator).

---

## Run it locally

Need [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm test
npm run dev
# http://localhost:8787
```

Production build (this is what you deploy):

```bash
npm run build
npm start
# python3 server.py serves the dist/ folder on port 8787
```

`npm run build` type-checks and writes a static PWA into `dist/`. Camera requires a **secure context** (HTTPS or localhost).

### Deploy (static / Vercel)

The built site is static files. No server, no accounts, no analytics.

**Vercel:** import the GitHub repo. Build command `npm run build`, output directory `dist`. After deploy, open the `https://…vercel.app` URL in iPhone Safari and Add to Home Screen.

**Any static host:** run `npm run build` and upload `dist/`. The service worker and manifest expect to be served from the **site root** (`/`), not a subpath.

Nothing phones home after the first load. Profiles stay in `localStorage` on that device.

---

## Safety

- Angular estimate only — not a surveyed optic
- Recalibrate after orientation change, camera flip, or a different phone
- Verify holds and size calls on a known-distance target or a real scope
- Digital zoom is not optical magnification
- You are responsible for safe firearm handling and range rules
