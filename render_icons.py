#!/usr/bin/env python3
"""Render BL Prognose master SVG to every iOS icon size."""

import cairosvg
from pathlib import Path

SRC = Path("/home/claude/BLPrognose-iOS-Icons/BLPrognose.svg")
OUT = Path("/home/claude/BLPrognose-iOS-Icons/AppIcon.appiconset")
OUT.mkdir(parents=True, exist_ok=True)

# (pixel_size, filename) -- official iOS AppIcon.appiconset set
RENDITIONS = [
    (20,   "Icon-App-20x20@1x.png"),
    (40,   "Icon-App-20x20@2x.png"),
    (60,   "Icon-App-20x20@3x.png"),
    (29,   "Icon-App-29x29@1x.png"),
    (58,   "Icon-App-29x29@2x.png"),
    (87,   "Icon-App-29x29@3x.png"),
    (40,   "Icon-App-40x40@1x.png"),
    (80,   "Icon-App-40x40@2x.png"),
    (120,  "Icon-App-40x40@3x.png"),
    (120,  "Icon-App-60x60@2x.png"),
    (180,  "Icon-App-60x60@3x.png"),
    (76,   "Icon-App-76x76@1x.png"),
    (152,  "Icon-App-76x76@2x.png"),
    (167,  "Icon-App-83.5x83.5@2x.png"),
    (1024, "Icon-App-1024x1024@1x.png"),
]

svg_bytes = SRC.read_bytes()

for size, name in RENDITIONS:
    cairosvg.svg2png(
        bytestring=svg_bytes,
        write_to=str(OUT / name),
        output_width=size,
        output_height=size,
    )
    print(f"{size:>4}px  {name}")

print(f"\n{len(RENDITIONS)} files written to {OUT}")
