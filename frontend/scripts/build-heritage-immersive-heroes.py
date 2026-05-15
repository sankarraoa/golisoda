#!/usr/bin/env python3
"""Convert heritage hero sources (PNG or JPEG) to RGBA PNGs with transparency.

Removes uniform / checkerboard-style backgrounds by flood-filling from the
image edge against k-means(k=2) colors sampled from the border.
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def kmeans2_colors(samples: np.ndarray, iters: int = 12) -> tuple[np.ndarray, np.ndarray]:
    c1 = samples[0].astype(np.float32)
    c2 = samples[len(samples) // 2].astype(np.float32)
    for _ in range(iters):
        d1 = ((samples - c1) ** 2).sum(axis=1)
        d2 = ((samples - c2) ** 2).sum(axis=1)
        m1 = samples[d1 <= d2]
        m2 = samples[d1 > d2]
        if len(m1):
            c1 = m1.mean(axis=0)
        if len(m2):
            c2 = m2.mean(axis=0)
    return c1, c2


def edge_background_mask(rgb: np.ndarray, thresh: float) -> np.ndarray:
    h, w = rgb.shape[:2]
    edge: list[tuple[int, int]] = []
    for x in range(w):
        edge.append((0, x))
        edge.append((h - 1, x))
    for y in range(h):
        edge.append((y, 0))
        edge.append((y, w - 1))

    samples = np.array([rgb[y, x] for y, x in edge], dtype=np.float32)
    c1, c2 = kmeans2_colors(samples)
    centers = np.stack([c1, c2])

    def near_bg(px: np.ndarray) -> bool:
        px = px.astype(np.float32)
        d = ((centers - px) ** 2).sum(axis=1)
        return bool(d.min() <= thresh**2)

    visited = np.zeros((h, w), dtype=bool)
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y, x in edge:
        if near_bg(rgb[y, x]):
            visited[y, x] = True
            bg[y, x] = True
            q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w or visited[ny, nx]:
                continue
            if not near_bg(rgb[ny, nx]):
                continue
            visited[ny, nx] = True
            bg[ny, nx] = True
            q.append((ny, nx))
    return bg


def rasterize(src: Path, dest: Path, thresh: float = 34.0) -> None:
    im = Image.open(src).convert("RGB")
    a = np.array(im)
    rgb = a[:, :, :3]
    bg = edge_background_mask(rgb, thresh)
    rgba = np.dstack([rgb, np.where(bg, 0, 255).astype(np.uint8)])
    Image.fromarray(rgba).save(dest, format="PNG", optimize=True)


def main() -> None:
    if len(sys.argv) < 2 or len(sys.argv[1:]) % 2 != 0:
        print(
            "Usage: build-heritage-immersive-heroes.py <src> <dest> [src dest ...]",
            file=sys.stderr,
        )
        sys.exit(1)
    pairs = list(zip(sys.argv[1::2], sys.argv[2::2]))
    for s, d in pairs:
        rasterize(Path(s), Path(d))


if __name__ == "__main__":
    main()
