from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


WEAPONS = {
    "cyan-heavy": "微信图片_20260808061510_22_44.jpg",
    "violet-rifle": "微信图片_20260808061511_23_44.jpg",
    "white-tech": "微信图片_20260808061512_24_44.jpg",
    "ember-cannon": "微信图片_20260808061514_25_44.jpg",
}
FLIP_TO_FACE_RIGHT = {"cyan-heavy", "violet-rifle", "ember-cannon"}
FRAME_SIZE = 192
WEAPON_LIMIT = 176


def remove_checkerboard(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    height, width = rgb.shape[:2]
    # The source has a bright checkerboard/white canvas. Treat only connected
    # near-white regions touching the border as background, preserving white weapon panels.
    brightness = rgb.mean(axis=2)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    background_like = (brightness > 214) & (spread < 34)
    exterior = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if background_like[y, x] and not exterior[y, x]:
                exterior[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if background_like[y, x] and not exterior[y, x]:
                exterior[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= next_y < height and 0 <= next_x < width and background_like[next_y, next_x] and not exterior[next_y, next_x]:
                exterior[next_y, next_x] = True
                queue.append((next_y, next_x))

    # Remove the bottom-right watermark area before finding the weapon bounds.
    exterior[int(height * 0.88) :, int(width * 0.78) :] = True
    alpha = np.where(exterior, 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.75)))
    return Image.fromarray(np.dstack((rgb.astype(np.uint8), alpha)), "RGBA")


def tight_crop(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Weapon image has no foreground after background removal")
    left, top, right, bottom = bbox
    padding = 8
    return image.crop((max(0, left - padding), max(0, top - padding), min(image.width, right + padding), min(image.height, bottom + padding)))


def normalize(image: Image.Image) -> Image.Image:
    cropped = tight_crop(image)
    scale = min(WEAPON_LIMIT / cropped.width, WEAPON_LIMIT / cropped.height)
    resized = cropped.resize((max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((FRAME_SIZE - resized.width) // 2, (FRAME_SIZE - resized.height) // 2))
    return canvas


parser = argparse.ArgumentParser(description="Clean four user-provided weapon JPGs into transparent game sprites.")
parser.add_argument("source", type=Path)
parser.add_argument("project", type=Path)
arguments = parser.parse_args()

destination = arguments.project / "public" / "assets" / "v3" / "weapons"
destination.mkdir(parents=True, exist_ok=True)
preview = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE), "#18222c")
for index, (weapon, filename) in enumerate(WEAPONS.items()):
    sprite = normalize(remove_checkerboard(Image.open(arguments.source / filename)))
    if weapon in FLIP_TO_FACE_RIGHT:
        sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    sprite.save(destination / f"{weapon}.png", optimize=True)
    preview.alpha_composite(sprite, (index * FRAME_SIZE, 0))
    print(f"{weapon}: {filename} -> {destination / (weapon + '.png')}")
preview.save(arguments.project / "artifacts" / "weapon-preview.png", optimize=True)
