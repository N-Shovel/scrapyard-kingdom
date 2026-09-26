# Scrapyard Kingdom

A 3D action tower defense game in plain JavaScript, HTML and CSS, rendered with [Three.js](https://threejs.org/) from a CDN. No build step.

**Play it online:** https://n-shovel.github.io/scrapyard-kingdom/

## Run it
Play in the browser at the link above (hosted on GitHub Pages from the `main` branch), or run it locally:
Double-click `index.html`. It needs an internet connection to load Three.js and the fonts.
The VS Code **Live Server** extension also works.

## How a round works
1. **Preparation (top-down view, 3 minutes):** place gear from your inventory (or buy more with scrap), pick things up, repair, and refuel. Press **G** or click **READY** to start early.
2. **Combat (no time limit):** first/third person. Every enemy spawns within the first minute from the gates marked by red beams. The round ends once they are all dead.
3. **Round end:** **everything you placed returns to your inventory** (it keeps its damage), and **the junkyard is rebuilt with a new layout**.

## Controls
**Preparation (top-down)**
| Key | Action |
|---|---|
| LMB / drag | Place selected gear |
| RMB | Pick up into inventory |
| 1-7 / click hotbar | Choose gear · **8** = repair tool (hold LMB on damaged gear) |
| U | Open the Base Workshop (upgrades, healing) |
| F | Refuel the Repair Torch (costs scrap) |
| WASD, mouse wheel | Pan, zoom |
| G / Enter | Start the round |

**Combat**
| Key | Action |
|---|---|
| WASD / Shift / Space | Move / sprint / jump |
| Mouse, LMB | Look, shoot / use |
| R | Reload |
| 1 / 2 (or wheel) | Scrap Shotgun / Repair Torch |
| V | Toggle first / third person |
| B (or Tab) | Build mode: 1-7 pick, LMB place, X or RMB to pick up |
| E (at the Stash) | Base Workshop (pauses the fight) |
| H | Use a medkit (+50 HP) |
| M | Full map |
| F (hold, at the Stash's red pump) | Refuel the Repair Torch |
| Esc | Pause |

## Enemies and defenses
- **Raider:** heads for the Stash, attacks turrets next to it, steals scrap. 40% are aggressive and will chase you.
- **Mutant:** fast, and always hunts you.
- **Brute:** slow and tough. Bashes through walls rather than walking long detours.
- **Scrap Drone** (from round 2): flies over walls and shoots the Stash or you.
- **Wall lock-on:** if a gate's cheapest route means smashing a wall, that gate locks onto that wall until it falls, even if you change the maze afterwards.
- **Junk Turret:** ground only, needs line of sight (it can fire over 1 wall). **Flak Cannon:** air only.
- **Traps** (walkable, all wear out): **Spike Trap** stabs, **Tar Pit** slows enemies by 55%, **Scrap Mine** explodes once and damages everything nearby.
- **Scaling:** every round enemies get +15% health, +10% damage and +3% speed (up to +35%).
- **Base Workshop:** spend scrap on shotgun damage, fire rate, magazine size, max health, armor, move speed, torch efficiency and turret damage, plus instant healing and medkits.
- **Scrap drops never expire.** Whatever is still on the ground when the round ends is collected automatically.

## Project layout
```
index.html        page + HUD markup
css/style.css     HUD / menu styling
js/config.js      ALL balance numbers (round length, costs, HP, damage, speeds). Tweak here first
js/grid.js        map generation, collision, flow-field pathfinding, gate routes, wall lock-on pathing
js/inventory.js   gear you own but haven't placed
js/upgrades.js    Base Workshop: upgrades, healing, medkits
js/player.js      movement + 1st/3rd person camera
js/weapons.js     shotgun + repair torch (fuel)
js/build.js       placing / picking up gear, enemy route preview
js/topview.js     top-down camera for the prep phase
js/structures.js  walls, turrets, flak, spike traps, the Stash
js/enemies.js     raider / mutant / brute / drone AI
js/waves.js       round director (3 min prep → fight until all enemies die → return gear + new terrain)
js/minimap.js     minimap + full map
js/pickups.js     scrap drops
js/hud.js         HUD updates
js/effects.js     tracers, particles, health bars
js/sfx.js         synthesized sound effects
js/main.js        renderer, scene, game states, main loop
```
