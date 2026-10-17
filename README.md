# Banner & Blade

An original low-poly, Mount & Blade–style game for iPhone/iPad, built with three.js. It runs in
Safari and installs to the Home Screen as a full-screen app. No Xcode or App Store needed.

This is **not** a port of Bannerlord or Warband (those are closed-source Windows games). Everything
here — code, models, sounds — is original.

## Play it

**On a computer (testing):**

```sh
python3 -m http.server 8000     # or: npx serve
# open http://localhost:8000  (add ?touch=1 to preview the touch controls)
```

**On an iPhone/iPad:**

1. Host the folder over HTTPS. Easiest: push to GitHub, enable *Settings → Pages → Source: GitHub
   Actions*, and the included workflow publishes it on every push to `main`.
2. Open the URL in Safari → Share → **Add to Home Screen**. It launches full-screen and works
   offline after the first load.

(Over plain `http://<your-pc-ip>:8000` on the same Wi-Fi it also runs; it just won't cache offline.)

## Controls

| | Touch | Keyboard / mouse |
|---|---|---|
| Ride / walk | left thumb stick | WASD |
| Look | drag right side | mouse (click to capture) |
| Swing | **Swing** button — tap, or drag ↑ ← → ↓ for overhead / left / right / thrust | click (move mouse to aim), keys 1–4 |
| Block | **Block** (hold) | right-click / Shift |
| Mount / dismount | **Mount** button | F |

Gallop into bandits for charge damage; mounted swings hit harder the faster you ride. Block faces
forward only. Camps respawn two minutes after you clear them.

## Roadmap

- [x] **Stage 1 — Ride and fight:** low-poly terrain, horse + rider, directional melee, blocking,
      mounted charge, bandit camps, village, minimap, touch controls, PWA install.
- [ ] **Stage 2 — World map:** zoomed-out campaign map, travel between towns, parties, day/night.
- [ ] **Stage 3 — Troops & towns:** recruit and upgrade troops, command them in battle, trade,
      inventory and equipment, quests.
- [ ] **Stage 4 — Sieges:** walled castles, ladders, towers, rams, defending your own keep.
- [ ] Factions, lords, diplomacy, kingdom play, saves.

## Layout

```
index.html            page, HUD, touch UI, styles
src/main.js           bootstrap, game loop, camp respawns
src/world.js          terrain, trees, village, camps, sky, lighting
src/lowpoly.js        procedural humanoid + horse models and swing animation
src/player.js         riding, on-foot movement, combat, camera
src/enemy.js          bandit AI and camps
src/input.js          keyboard/mouse + virtual stick/buttons
src/{hud,fx,sfx}.js   HUD & minimap, hit sparks, synthesized sound
vendor/               three.js (MIT)
sw.js, manifest       offline cache + install metadata
```
