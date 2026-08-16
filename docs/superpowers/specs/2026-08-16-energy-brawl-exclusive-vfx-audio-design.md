# Energy Brawl Exclusive Skill VFX And Audio Upgrade Design

## Scope

This increment upgrades presentation without adding characters or changing the six existing exclusive-skill balance values. Work is delivered in three ordered phases:

1. Complete four-stage visual and audio feedback for all six exclusive skills.
2. Replace the shared projectile presentation with character-specific muzzle, core, trail, and impact profiles.
3. Add map ambience and a priority-aware combat mix while preserving iPhone audio unlock behavior.

The previously discussed character specialization branches remain a later gameplay increment. This presentation architecture must allow a future specialization variant to select a different effect profile without rewriting the renderer.

## Design Goals

- Every exclusive skill is identifiable without reading text.
- The local player can distinguish preparation, release, active effect, and completion.
- Enemy danger remains readable in six-player combat without covering the playfield.
- Audio emphasizes local kills, deaths, skills, and nearby threats instead of playing every remote sound at full weight.
- Full DPR, antialiasing, projectile trails, map particles, and the 30 Hz snapshot policy remain enabled.
- One-shot effects survive duplicate snapshots, while persistent effects recover correctly after reconnect.

## Non-Goals

- No new characters, weapons, maps, modes, or skill balance changes.
- No music system or voice announcements.
- No automatic quality reduction based on device detection.
- No continuous high-volume sound for every bullet or particle.
- No reliance on client-only timers for authoritative skill duration.

## Presentation Event Architecture

The client uses two complementary sources:

1. **Authoritative skill events** drive one-shot presentation edges. A server-owned sequence number identifies accepted cast, active/impact, and end events. Clients deduplicate by sequence number.
2. **Player skill state snapshots** drive persistent presentation. Reconnecting clients reconstruct an active bulwark, overload, afterimage, anchor, or reveal effect from `exclusiveSkillState` even if they missed its original event.

The existing skill event contract is normalized to four presentation stages:

- `telegraph`: local-only held aim preview before the request is sent.
- `cast`: server-accepted release edge, visible and audible to relevant clients.
- `active`: the first authoritative gameplay effect or the start of a timed state.
- `end`: expiry, cancellation, death cleanup, anchor return completion, or other authoritative termination.

Rejected requests may show a local UI error but never play a successful cast effect.

The server does not stream particle state. It publishes compact semantic events and authoritative timestamps; the renderer selects the correct visual and audio profile locally.

## Module Boundaries

- `exclusive-skill-feedback.ts`: stage selection, event deduplication, reconnect reconstruction, distance and relationship classification.
- `exclusive-skill-vfx.ts`: immutable per-character stage profiles and effect instance creation.
- `exclusive-skill-audio.ts`: immutable per-character audio identities and stage requests.
- `combat-audio.ts`: shared buses, voice priority, distance attenuation, iOS unlock, sample fallback, and limiting.
- `projectile-presentation.ts`: character-specific muzzle, core, trail, and impact profiles.
- `environment-audio.ts`: map ambience lifecycle and map-mechanic ducking.
- `game-scene.ts`: orchestration only; it owns pools and positions effect instances but does not contain six character-specific drawing branches.

These boundaries prevent the already large scene renderer from becoming the catalog for every new effect.

## Shared Four-Stage Rules

### Telegraph

- Uses the existing dedicated skill indicator rather than the firing indicator.
- Shows direction, range, destination, radius, or frontal arc appropriate to the skill.
- Is visible primarily to the local player and never exposes hidden pre-cast intent to enemies.
- Cancels cleanly when the pointer is released outside the control, the player dies, or the skill becomes unavailable.

### Cast

- Starts only after the server accepts the skill.
- Uses a short high-contrast flash, directional burst, or expanding ring lasting roughly 80-220 ms.
- Plays the skill's main transient sound and an appropriate haptic pulse for the local player.
- Remote cast gain is attenuated by distance and limited by voice priority.

### Active

- Instant skills use a readable impact or travel effect.
- Timed skills use a persistent pooled effect tied to authoritative `startedAt` and `expiresAt` values.
- Team-friendly areas use softer interiors; enemy danger uses sharper edges and a warning rim.
- Active effects never obscure player silhouettes, health bars, aim indicators, or map-mechanic warnings.

### End

- Uses a brief energy collapse, discharge, shield fracture, or trail fade.
- Is emitted for natural expiry and forced cleanup so visuals cannot remain stuck after death or reset.
- Has lower audio priority than cast, kill, death, and map-mechanic warnings.

## Character Effect Identities

### Blaze: Breach Dash

- **Telegraph:** thick red-orange path, anchor glyph, destination wedge, and return-path preview when an anchor already exists.
- **Cast:** compressed ignition ring, forward flame slash, and a bright anchor stamp at the origin.
- **Active:** continuous travel streak, segmented afterimage, stable anchor beacon, and a visible tether that becomes more urgent near expiry.
- **End:** dash arrival shockwave; anchor return uses an inward collapse followed by a short reverse burst. Anchor expiry dissolves without implying a successful return.
- **Audio:** mechanical ignition, short wind cut, anchor hum, and a heavy reverse snap on return.

### Medic: Pulse Emergency

- **Telegraph:** cyan-green healing radius with ally silhouettes highlighted inside the valid area.
- **Cast:** central medical pulse and four outward diagnostic arcs.
- **Active:** layered healing wave, life particles flowing toward healed targets, and a distinct cleansing sparkle when suppression is removed.
- **End:** soft ring contraction with no aggressive explosion.
- **Audio:** clean electronic pulse, warm harmonic body, and a short confirmation chime only when actual healing or cleansing occurs.

### Fortress: Mobile Bulwark

- **Telegraph:** frontal protection arc plus a softer ally-protection radius.
- **Cast:** armored plates assemble from the center toward the facing direction.
- **Active:** layered hexagonal barrier, directional bullet-contact sparks, ally protection shimmer, and a restrained suppression field on enemies.
- **End:** plates lose power in sequence and collapse inward; forced destruction uses a sharper fracture.
- **Audio:** low mechanical deployment, shield resonance, direction-aware impact ticks, and a descending shutdown tone.

### Arc: Capacitor Overload

- **Telegraph:** compact blue-white charge ring around the weapon and movement vector.
- **Cast:** capacitor nodes connect to the weapon with a rising electrical sweep.
- **Active:** weapon glow, animated current around the player, denser muzzle discharge, and short electric residue on movement turns.
- **End:** controlled electrical discharge followed by a brief low-energy fade, not a failure explosion.
- **Audio:** rising charge, electrical crackle body, slightly sharper local fire transient, and a safe discharge tail.

### Phase: Phase Shift

- **Telegraph:** purple displacement corridor, wall-crossing path, and exact safe destination marker.
- **Cast:** body fragments into directional phase slices and the origin tears open.
- **Active:** visible travel corridor, origin-to-target distortion, destination reassembly, and the existing reveal/fire-lock status cues.
- **End:** the phase seam closes with a compact implosion. Rejected unsafe targets show only a local invalid indicator.
- **Audio:** vacuum-like intake, spatial break, short stereo travel sweep, and a precise reassembly snap.

### Runner: Afterimage Run

- **Telegraph:** forward speed cone and a short preview of the first residual image.
- **Cast:** narrow acceleration ring and ground streak burst.
- **Active:** multiple sprite-based afterimages, curved speed ribbons, stronger projectile exhaust, and a readable damage-boost weapon accent.
- **End:** afterimages catch up and merge into the player instead of vanishing simultaneously.
- **Audio:** fast wind cut, high-frequency electronic pulse, restrained continuous rush, and a short deceleration tail.

## Visual Asset Strategy

The first implementation should prefer redistributable sprite sheets and transparent PNG effect textures that match the existing dark science-fiction pixel style. Project-authored procedural geometry remains appropriate for indicators, arcs, tethers, and exact gameplay boundaries.

Each character effect package may contain:

- one cast sheet;
- one active-loop sheet or reusable particle texture set;
- one end sheet;
- optional impact/contact textures;
- one audio asset set with procedural fallback.

Assets must record source, author, license, source URL, local modifications, and output paths in the project manifests and `THIRD_PARTY_ASSETS.md`. Assets without a clear redistribution license are not eligible for the GitHub version.

Texture dimensions remain bounded and declared in the manifest. High visual quality comes from layered sprites, blending, pooling, and correct DPR rather than uncontrolled texture sizes.

## Character-Specific Projectile Upgrade

Projectile gameplay remains unchanged. Presentation resolves the owner character and selects a profile with four parts:

- **Muzzle:** shape, scale, color temperature, and flash duration.
- **Core:** silhouette and animated glow, not only a shared white orb tinted by player color.
- **Trail:** tapered or particle-based trail with stable world-space length across devices.
- **Impact:** distinct wall, player, and shield presentation when the authoritative impact type is available.

The six profiles follow the same identities as their exclusive skills. Remote fire remains rate limited. Trail emission is distance-based, not frame-count-based, so iPhone and tablet rendering stays visually consistent.

A small bounded authoritative impact-event stream is preferred over guessing collision type from projectile disappearance. It carries only sequence, position, owner, target when relevant, and `wall | player | shield`; clients deduplicate and recycle pooled effects.

## Environment Audio

Each map receives one seamless low-priority ambience bed plus localized accents:

- Reactor Core: machinery hum, pressure movement, and distant vent pulses.
- Neon Docks: electrical infrastructure, distant transport motion, and restrained synthetic city texture.
- Crystal Ruins: resonant wind, crystalline harmonics, and occasional low-frequency stone movement.

Ambience follows the active map and fades across match transitions. It pauses or safely resumes with the audio context and never starts before user gesture unlock.

Map-mechanic warning and activation cues keep their existing identities but gain sampled layers with procedural fallback. Warnings temporarily duck ambience and low-priority remote gunfire so players can recognize danger without reading text.

## Audio Mix And Priority

Audio is organized into logical buses:

- local critical feedback;
- local weapon and skill;
- nearby world combat;
- objectives and map mechanics;
- ambience;
- UI.

Priority order is:

`local kill/death > map warning > local exclusive skill > nearby incoming threat > objective > local weapon > remote skill > remote weapon > ambience`

The mixer limits concurrent voices per category, rate limits repeated remote fire and shield contacts, attenuates by distance, and applies light stereo panning from source position. A shared compressor/limiter prevents clipping when six players act together.

Settings retain the current mute control and add compact effects and ambience level controls. Preferences are local to the device. Unsupported storage, vibration, stereo panning, or sample decoding falls back without breaking combat.

## Performance Constraints

- Every repeated effect uses a fixed or reusable object pool.
- No effect allocates particles every render frame.
- Persistent loops update transforms from interpolated snapshots and authoritative timestamps.
- One-shot event history is bounded and sequence-deduplicated.
- Audio buffers preload after unlock and are reused; failed loads use procedural cues.
- The client does not reduce DPR, disable trails, remove effects, or request lower snapshot frequency.
- Six-player load tests track active effects, event backlog, pool exhaustion, longest frame, and audio voice saturation.

## Failure Handling

- Missing texture: use procedural geometry and log one deduplicated warning.
- Missing or undecodable audio: use the procedural stage cue.
- Missed cast event after reconnect: reconstruct only the still-active persistent state; do not replay an old cast sound.
- Duplicate event: ignore by sequence key.
- Server rejection: show local invalid feedback without successful skill audio or world effect.
- Death, reset, map change, or scene shutdown: release all effect instances and stop map ambience cleanly.

## Verification

Automated tests cover:

- four valid stage profiles for all six skills;
- event sequence deduplication and reconnect reconstruction;
- natural and forced end cleanup;
- rejected casts never producing successful feedback;
- audio priority, voice limits, distance attenuation, panning bounds, and procedural fallback;
- iPhone unlock and resume behavior;
- character-specific projectile profile selection;
- distance-based trail consistency;
- authoritative wall/player/shield impact classification;
- ambience transition and map-warning ducking;
- manifest completeness and redistribution metadata.

Rendered QA captures every skill at telegraph, cast, active, and end on desktop and 932x430 mobile landscape. Final playtests use six players, all three maps, repeated matches, reconnect, death cleanup, and simultaneous skill pressure. Acceptance requires no stuck effects, missing local cues, unreadable enemy danger, clipped audio, pool exhaustion, sustained hitching, or device-specific loss of projectile trails.

## Delivery Order

1. Event contract, profile modules, pools, and tests.
2. Blaze and Phase displacement skills, including exact path and endpoint feedback.
3. Medic and Fortress area/protection skills.
4. Arc and Runner timed offensive buffs.
5. Character-specific projectiles and authoritative impact presentation.
6. Map ambience, mix controls, ducking, and iPhone verification.
7. Full regression, six-player soak, visual review, asset-license audit, README, and version update.
