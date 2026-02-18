# Physics Unit Conversion: C++ → Web Port

## Overview

The C++ reference client and our web port use **different speed unit conventions** but share the same **position coordinate system** (WZ pixels). This document explains both systems, how to convert between them, and where each is used.

---

## Coordinate System (Shared — 1:1 WZ px = Canvas px)

Both systems use **WZ pixel coordinates** directly for positions.
Our canvas is 1280×960 and draws WZ positions **1:1 with no scaling factor**.

- `x, y` — map coordinates in WZ pixels (int16 in C++, float in JS)
- Foothold endpoints `x1,y1,x2,y2` — WZ pixels
- Origins, dimensions — all in WZ pixels
- Canvas rendering: `screenX = worldX - camera.x + canvasWidth/2`
- **1 WZ pixel = 1 canvas pixel** (no DPI scaling, no coordinate transform)
- CSS may scale the canvas element to fit the window, but the internal
  drawing resolution stays 1280×960 with 1:1 WZ pixel mapping

This means all physics values (speeds, forces, displacements) directly
correspond to visible pixel distances on screen. A mob sliding 20 WZ px
from knockback = 20 visible pixels on the canvas.

---

## C++ Unit System: Per-Tick

C++ runs a fixed-rate game loop at `Constants::TIMESTEP = 8ms` (125 ticks/sec).

| Quantity | Unit | Example |
|----------|------|---------|
| Position | WZ px | `phobj.x`, `phobj.y` |
| Speed | px/tick | `hspeed = 0.2` means 0.2 px per 8ms tick |
| Force | px/tick² | `hforce = 0.2` adds 0.2 to hacc each tick |
| Acceleration | px/tick² | `hacc` computed from force + friction |
| Time | ticks | `counter > 200` means 200 × 8ms = 1.6s |

**Integration per tick:**
```
hacc = hforce - friction(hspeed)   // move_normal
hforce = 0                         // clear after use
hspeed += hacc                     // velocity update
x += hspeed                        // position update (phobj.move)
```

**Key constants (all per-tick at 8ms):**
```
GRAVFORCE    = 0.14    px/tick²
FRICTION     = 0.5     (dimensionless coefficient)
SLOPEFACTOR  = 0.1     (dimensionless coefficient)
GROUNDSLIP   = 3.0     (divisor for inertia: inertia = hspeed / GROUNDSLIP)
SWIMGRAVFORCE= 0.03    px/tick²
SWIMFRICTION = 0.08    (dimensionless coefficient)
FLYFRICTION  = 0.05    (dimensionless coefficient)
```

**Player (C++ PlayerStates.cpp, Player.cpp):**
```
walkforce = 0.05 + 0.11 * speed_stat / 100     // px/tick²
jumpforce = 1.0 + 3.5 * jump_stat / 100        // px/tick (applied as vforce)
climbforce = speed_stat / 100.0                 // px/tick
```
At speed=100, jump=100: walkforce=0.16, jumpforce=4.5

**Mob (C++ Mob.cpp):**
```
speed = (wz_speed + 100) * 0.001               // px/tick (hforce during MOVE)
KB_FORCE_GROUND = 0.2                           // px/tick² (hforce during HIT)
KB_FORCE_AIR    = 0.1                           // px/tick²
counter starts at 170, exits at >200            // 31 ticks = 248ms
```
At wz_speed=0: mob force = 0.1 px/tick

---

## Web Port Unit System: Hybrid

Our web port uses **two different conventions** depending on the subsystem:

### Player Physics: px/second

Player `vx, vy` are stored in **pixels per second** and converted to/from per-tick as needed.

```
PHYS_TPS = 125                                  // ticks per second (1000/8)
playerWalkforce() = 0.05 + 0.11 * speed/100     // SAME as C++ (per-tick)
playerJumpforce() = 1.0 + 3.5 * jump/100        // SAME as C++ (per-tick)
```

**Conversion in updatePlayer():**
```javascript
const numTicks = dt * PHYS_TPS;                 // fractional ticks this frame
let hspeedTick = player.vx / PHYS_TPS;          // px/sec → px/tick
hspeedTick = applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks);
player.vx = hspeedTick * PHYS_TPS;              // px/tick → px/sec
// Then position: player.x += player.vx * dt    // px/sec * seconds = px
```

Jump: `player.vy = -playerJumpforce() * PHYS_TPS` → converts per-tick force to px/sec

### Mob Physics: px/tick (C++ native)

Mob `phobj.hspeed, phobj.vspeed` are stored in **pixels per tick** (8ms), same as C++.

```
MOB_PHYS_TIMESTEP = 8                           // ms per tick
mobSpeed = (wz_speed + 100) * 0.001             // px/tick (SAME as C++)
MOB_KB_FORCE_GROUND = 0.2                       // px/tick² (SAME as C++)
MOB_KB_FORCE_AIR = 0.1                          // px/tick² (SAME as C++)
MOB_GRAVFORCE = 0.14                            // px/tick² (SAME as C++)
```

**Integration in mobPhysicsStep() (called N times per frame):**
```javascript
const steps = Math.max(1, Math.round(dtMs / MOB_PHYS_TIMESTEP));
for (let s = 0; s < steps; s++) {
    mobPhysicsStep(map, ph, isSwimMap);  // one C++ tick
}
```

Each `mobPhysicsStep` call does exactly one C++ tick:
```
update_fh → move_normal → limit_movement → phobj.move
```

---

## Conversion Formulas

### C++ per-tick → px/second
```
px_per_sec = cpp_per_tick * PHYS_TPS
           = cpp_per_tick * 125
```
Example: `hspeed = 0.2 px/tick` → `0.2 × 125 = 25 px/sec`

### px/second → C++ per-tick
```
cpp_per_tick = px_per_sec / PHYS_TPS
             = px_per_sec / 125
```

### C++ per-tick² (force/accel) → px/sec²
```
px_per_sec2 = cpp_per_tick2 * PHYS_TPS²
            = cpp_per_tick2 * 15625
```
Example: `GRAVFORCE = 0.14 px/tick²` → `0.14 × 15625 = 2187.5 px/sec²`

### C++ tick count → milliseconds
```
ms = ticks * 8
```
Example: `counter > 200` → `200 × 8 = 1600ms`

---

## Per-System Summary

| System | Speed Unit | Force Unit | Position Unit | Timestep |
|--------|-----------|------------|---------------|----------|
| C++ (all) | px/tick | px/tick² | WZ px | 8ms fixed |
| Web Player | px/sec | px/tick (internal) | WZ px | variable dt |
| Web Mob | px/tick | px/tick² | WZ px | 8ms fixed |

---

## Practical Porting Guide

### Porting a C++ mob constant:
**Use directly.** Mob physics already runs in C++ native units.
```javascript
// C++: double KBFORCE = 0.2;
const MOB_KB_FORCE_GROUND = 0.2;  // exact same value
```

### Porting a C++ player constant:
**Convert speed to px/sec by multiplying by PHYS_TPS.**
```javascript
// C++: phobj.vforce = -jumpforce;    (per-tick)
// JS:  player.vy = -jumpforce * PHYS_TPS;  (per-sec)
```

### Porting a C++ counter/timer:
**Convert ticks to milliseconds by multiplying by 8.**
```javascript
// C++: counter > 200  (200 ticks)
// JS:  counter > 200  (if using per-tick counter)
// OR:  elapsedMs > 1600  (if using ms timer)
```

### Adding a new force to player:
```javascript
// 1. Compute per-tick: forceTick = <C++ formula>
// 2. Apply in ground loop: hspeedTick += forceTick * numTicks
// 3. Convert back: player.vx = hspeedTick * PHYS_TPS
```

### Adding a new force to mob:
```javascript
// Use C++ value directly in hforce:
ph.hforce = <C++ value>;
// mobPhysicsStep handles integration identically to C++
```

---

## Validation: KB Displacement Calculation

C++ HIT: `hforce = 0.2` for 31 ticks (counter 170→201), flat ground, from rest.

Per tick (simplified, ignoring friction initially):
- Tick 0: hacc=0.2, hspeed=0.2, dx=0.2
- Tick 1: hacc=0.2-friction(0.2/3), hspeed≈0.36, dx≈0.56
- ...

With friction (`FRICTION=0.5, GROUNDSLIP=3.0`):
- `hacc = 0.2 - 0.6 * (hspeed / 3.0)`
- Terminal velocity when hacc=0: `0.2 = 0.6 * v/3` → `v = 1.0 px/tick` = 125 px/sec

Over 31 ticks the mob accelerates toward ~1.0 px/tick, total displacement ≈ 15-20 WZ px.

This is intentionally a **subtle slide**, not a dramatic knockback. The visual feedback comes primarily from the hit animation and sound, not large displacement.

---

## Files Reference

| File | Unit system | Notes |
|------|-------------|-------|
| `client/web/app.js` constants (PHYS_*) | per-tick | Player physics constants |
| `client/web/app.js` constants (MOB_*) | per-tick | Mob physics constants (C++ native) |
| `client/web/app.js` playerWalkforce() | per-tick | Same formula as C++ |
| `client/web/app.js` player.vx/vy | px/sec | Converted at integration boundary |
| `client/web/app.js` phobj.hspeed/vspeed | px/tick | C++ native for mobs |
| `client/web/app.js` mobPhysicsStep() | per-tick | One C++ tick per call |
| `client/web/app.js` applyGroundPhysics() | per-tick | Works in tick units internally |
