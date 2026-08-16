import type { CharacterId } from "../shared/character-catalog";
import type { ProjectileImpactEvent, Vec2 } from "../shared/protocol";
import { CHARACTER_PROJECTILE_ASSETS } from "./asset-registry";

export interface ProjectileVisualPart {
  textureKey: string;
  assetUrl: string;
  scale: number;
  alpha: number;
}

export interface ProjectilePresentation {
  characterId: CharacterId;
  muzzle: ProjectileVisualPart;
  core: ProjectileVisualPart;
  trail: ProjectileVisualPart;
  impacts: { wall: ProjectileVisualPart; player: ProjectileVisualPart; shield: ProjectileVisualPart };
  localFireSampleUrl: string;
  impactSampleUrl: string;
  trailSpacingWorld: number;
}

const CHARACTER_SETTINGS: Readonly<Record<CharacterId, { core: number; trail: number; spacing: number; alpha: number }>> = {
  blaze: { core: 1.16, trail: 1.18, spacing: 32, alpha: 0.94 },
  medic: { core: 0.92, trail: 1.06, spacing: 28, alpha: 0.88 },
  fortress: { core: 1.28, trail: 0.96, spacing: 38, alpha: 0.98 },
  arc: { core: 0.88, trail: 1.32, spacing: 24, alpha: 1 },
  phase: { core: 1.04, trail: 1.22, spacing: 30, alpha: 0.92 },
  runner: { core: 0.9, trail: 1.4, spacing: 22, alpha: 0.9 },
};

const part = (characterId: CharacterId, kind: keyof typeof CHARACTER_PROJECTILE_ASSETS[CharacterId], scale: number, alpha: number): ProjectileVisualPart => ({
  textureKey: `projectile:${characterId}:${kind}`,
  assetUrl: CHARACTER_PROJECTILE_ASSETS[characterId][kind],
  scale,
  alpha,
});

export function getProjectilePresentation(characterId: CharacterId): ProjectilePresentation {
  const settings = CHARACTER_SETTINGS[characterId];
  return {
    characterId,
    muzzle: part(characterId, "muzzle", 1.05, settings.alpha),
    core: part(characterId, "core", settings.core, settings.alpha),
    trail: part(characterId, "trail", settings.trail, settings.alpha * 0.86),
    impacts: {
      wall: part(characterId, "wall-impact", 0.94, settings.alpha),
      player: part(characterId, "player-impact", 1.16, settings.alpha),
      shield: part(characterId, "shield-impact", 1.24, settings.alpha),
    },
    localFireSampleUrl: `/assets/v4/audio/projectiles/${characterId}/local-fire.ogg`,
    impactSampleUrl: `/assets/v4/audio/projectiles/${characterId}/impact.ogg`,
    trailSpacingWorld: settings.spacing,
  };
}

export function selectProjectileTrailPoints(
  previous: Vec2,
  next: Vec2,
  spacingWorld: number,
): Vec2[] {
  if (!Number.isFinite(spacingWorld) || spacingWorld <= 0) return [];
  const deltaX = next.x - previous.x;
  const deltaY = next.y - previous.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < spacingWorld) return [];

  const count = Math.min(32, Math.floor(distance / spacingWorld));
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  return Array.from({ length: count }, (_, index) => ({
    x: previous.x + unitX * spacingWorld * (index + 1),
    y: previous.y + unitY * spacingWorld * (index + 1),
  }));
}

export interface SelectedProjectileImpactFeedback {
  events: ProjectileImpactEvent[];
  lastSequence: number;
}

export function selectProjectileImpactFeedback(
  events: readonly ProjectileImpactEvent[],
  lastSequence: number | null,
): SelectedProjectileImpactFeedback {
  if (lastSequence === null) {
    return { events: [], lastSequence: events.at(-1)?.eventSeq ?? 0 };
  }
  const selected = events.filter((event) => event.eventSeq > lastSequence);
  return {
    events: selected.map((event) => ({ ...event, position: { ...event.position } })),
    lastSequence: selected.at(-1)?.eventSeq ?? lastSequence,
  };
}
