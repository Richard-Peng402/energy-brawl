from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


DIRECTIONS = ("right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right")
FRAME_SIZE = 192
SPRITE_LIMIT = 164
BOTTOM_PADDING = 12


SHEETS = {
    "blaze": {
        "file": "微信图片_20260808043847_281_40.png",
        "grid": (4, 2),
        "slots": {
            "down": (0, 0), "down-left": (1, 0), "left": (2, 0), "up-left": (3, 0),
            "up": (0, 1), "up-right": (1, 1), "right": (2, 1), "down-right": (3, 1),
        },
    },
    "medic": {
        "file": "微信图片_20260808043846_280_40.png",
        "grid": (3, 3),
        "slots": {
            "up": (0, 0), "up-right": (1, 0), "right": (2, 0), "up-left": (0, 1),
            "down-right": (2, 1), "left": (0, 2), "down-left": (1, 2), "down": (2, 2),
        },
    },
    "fortress": {
        "file": "微信图片_20260808043852_284_40.png",
        "grid": (4, 2),
        "slots": {
            "down": (0, 0), "down-left": (1, 0), "left": (2, 0), "up-left": (3, 0),
            "up": (0, 1), "up-right": (1, 1), "right": (2, 1), "down-right": (3, 1),
        },
    },
    "arc": {
        "file": "微信图片_20260808043850_283_40.png",
        "grid": (3, 3),
        "slots": {
            "up": (0, 0), "up-right": (1, 0), "right": (2, 0), "up-left": (0, 1),
            "down": (1, 1), "down-right": (2, 1), "left": (0, 2), "down-left": (1, 2),
        },
    },
    "phase": {
        "file": "微信图片_20260808043853_285_40.png",
        "grid": (3, 3),
        "slots": {
            "up": (0, 0), "up-right": (1, 0), "right": (2, 0), "up-left": (0, 1),
            "down-right": (2, 1), "left": (0, 2), "down": (1, 2), "down-left": (2, 2),
        },
    },
    "runner": {
        "file": "微信图片_20260808043849_282_40.png",
        "grid": (3, 3),
        "slots": {
            "up-left": (0, 0), "up": (1, 0), "up-right": (2, 0), "left": (0, 1),
            "right": (2, 1), "down-left": (0, 2), "down": (1, 2), "down-right": (2, 2),
        },
    },
}


def flood_component(mask: np.ndarray, start: tuple[int, int], visited: np.ndarray) -> tuple[int, int, int, int, int]:
    height, width = mask.shape
    queue = deque([start])
    visited[start] = True
    min_y = max_y = start[0]
    min_x = max_x = start[1]
    count = 0
    while queue:
        y, x = queue.popleft()
        count += 1
        min_y, max_y = min(min_y, y), max(max_y, y)
        min_x, max_x = min(min_x, x), max(max_x, x)
        for next_y in range(max(0, y - 1), min(height, y + 2)):
            for next_x in range(max(0, x - 1), min(width, x + 2)):
                if mask[next_y, next_x] and not visited[next_y, next_x]:
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))
    return count, min_x, min_y, max_x + 1, max_y + 1


def largest_component_bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    dilated = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
    visited = np.zeros_like(dilated, dtype=bool)
    largest = (0, 0, 0, dilated.shape[1], dilated.shape[0])
    for y, x in np.argwhere(dilated):
        if visited[y, x]:
            continue
        component = flood_component(dilated, (int(y), int(x)), visited)
        if component[0] > largest[0]:
            largest = component
    _, left, top, right, bottom = largest
    return left, top, right, bottom


def transparent_sprite(cell: Image.Image) -> Image.Image:
    rgb = np.asarray(cell.convert("RGB"), dtype=np.int16)
    maximum = rgb.max(axis=2)
    chroma = maximum - rgb.min(axis=2)
    confident_foreground = (maximum > 42) & ((chroma > 10) | (maximum > 92))
    left, top, right, bottom = largest_component_bbox(confident_foreground)
    padding = 10
    left, top = max(0, left - padding), max(0, top - padding)
    right, bottom = min(cell.width, right + padding), min(cell.height, bottom + padding)
    cropped = np.asarray(cell.crop((left, top, right, bottom)).convert("RGB"), dtype=np.int16)

    border = np.concatenate((cropped[:5].reshape(-1, 3), cropped[-5:].reshape(-1, 3), cropped[:, :5].reshape(-1, 3), cropped[:, -5:].reshape(-1, 3)))
    background = np.median(border, axis=0)
    distance = np.sqrt(np.sum((cropped - background) ** 2, axis=2))
    brightness = cropped.max(axis=2)
    background_like = (brightness < 52) & (distance < 38)

    exterior = np.zeros(background_like.shape, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    height, width = background_like.shape
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

    alpha = np.where(exterior, 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.55)))
    rgba = np.dstack((cropped.astype(np.uint8), alpha))
    rgba = remove_small_neutral_components(rgba)
    sprite = Image.fromarray(rgba, "RGBA")
    final_bbox = sprite.getchannel("A").getbbox()
    return sprite.crop(final_bbox) if final_bbox else sprite


def remove_small_neutral_components(rgba: np.ndarray) -> np.ndarray:
    alpha = rgba[:, :, 3]
    mask = alpha > 80
    visited = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    height, width = mask.shape
    for start_y, start_x in np.argwhere(mask):
        if visited[start_y, start_x]:
            continue
        pixels: list[tuple[int, int]] = []
        queue = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        while queue:
            y, x = queue.popleft()
            pixels.append((y, x))
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    if mask[next_y, next_x] and not visited[next_y, next_x]:
                        visited[next_y, next_x] = True
                        queue.append((next_y, next_x))
        components.append(pixels)

    if not components:
        return rgba
    largest_size = max(len(component) for component in components)
    cleaned = rgba.copy()
    for component in components:
        if len(component) >= max(90, largest_size * 0.003):
            continue
        ys = np.fromiter((pixel[0] for pixel in component), dtype=np.int32)
        xs = np.fromiter((pixel[1] for pixel in component), dtype=np.int32)
        colors = cleaned[ys, xs, :3].astype(np.int16)
        mean_chroma = float(np.mean(colors.max(axis=1) - colors.min(axis=1)))
        if mean_chroma < 24:
            cleaned[ys, xs, 3] = 0
    return cleaned


def extract_sheet(sheet: Image.Image, columns: int, rows: int, slots: dict[str, tuple[int, int]]) -> dict[str, Image.Image]:
    extracted: dict[str, Image.Image] = {}
    for direction, (column, row) in slots.items():
        left = round(column * sheet.width / columns)
        right = round((column + 1) * sheet.width / columns)
        top = round(row * sheet.height / rows)
        bottom = round((row + 1) * sheet.height / rows)
        extracted[direction] = transparent_sprite(sheet.crop((left, top, right, bottom)))
    return extracted


def normalize_frames(frames: dict[str, Image.Image]) -> dict[str, Image.Image]:
    largest_width = max(frame.width for frame in frames.values())
    largest_height = max(frame.height for frame in frames.values())
    shared_scale = min(SPRITE_LIMIT / largest_width, SPRITE_LIMIT / largest_height)
    normalized: dict[str, Image.Image] = {}
    for direction, frame in frames.items():
        size = (max(1, round(frame.width * shared_scale)), max(1, round(frame.height * shared_scale)))
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        x = (FRAME_SIZE - resized.width) // 2
        y = FRAME_SIZE - BOTTOM_PADDING - resized.height
        canvas.alpha_composite(resized, (x, y))
        normalized[direction] = canvas
    return normalized


def render_preview(character_id: str, frames: dict[str, Image.Image], output: Path) -> None:
    cell_width, cell_height = FRAME_SIZE, FRAME_SIZE + 24
    preview = Image.new("RGBA", (cell_width * 4, cell_height * 2), "#111820")
    draw = ImageDraw.Draw(preview)
    for index, direction in enumerate(DIRECTIONS):
        column, row = index % 4, index // 4
        x, y = column * cell_width, row * cell_height
        for tile_y in range(0, FRAME_SIZE, 24):
            for tile_x in range(0, FRAME_SIZE, 24):
                color = "#202a34" if (tile_x // 24 + tile_y // 24) % 2 == 0 else "#17212a"
                draw.rectangle((x + tile_x, y + tile_y, x + tile_x + 23, y + tile_y + 23), fill=color)
        preview.alpha_composite(frames[direction], (x, y))
        draw.text((x + 8, y + FRAME_SIZE + 4), direction, fill="#f4f7fb")
    output.mkdir(parents=True, exist_ok=True)
    preview.save(output / f"{character_id}.png", optimize=True)


parser = argparse.ArgumentParser(description="Import six user-provided eight-direction character sheets.")
parser.add_argument("source", type=Path)
parser.add_argument("project", type=Path)
arguments = parser.parse_args()

preview_directory = arguments.project / "artifacts" / "directional-sprite-previews"
for character_id, config in SHEETS.items():
    source_file = arguments.source / str(config["file"])
    sheet = Image.open(source_file).convert("RGB")
    columns, rows = config["grid"]
    extracted = extract_sheet(sheet, int(columns), int(rows), config["slots"])
    normalized = normalize_frames(extracted)
    destination = arguments.project / "public" / "assets" / "v3" / "characters" / character_id
    direction_directory = destination / "directions"
    direction_directory.mkdir(parents=True, exist_ok=True)
    for direction in DIRECTIONS:
        normalized[direction].save(direction_directory / f"{direction}.png", optimize=True)
    normalized["down"].save(destination / "combat.png", optimize=True)
    normalized["down"].resize((256, 256), Image.Resampling.LANCZOS).save(destination / "portrait.png", optimize=True)
    render_preview(character_id, normalized, preview_directory)
    print(f"{character_id}: {sheet.width}x{sheet.height} -> 8 frames from {source_file.name}")
