"""Build a silent, captioned walkthrough from the live Hackathon Judge captures."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "assets" / "hackathon-judge"
FRAME_DIR = ROOT / "artifacts" / "hackathon-judge-video-frames"
OUTPUT = ASSET_DIR / "hackathon-judge-demo.mp4"
WIDTH = 1600
HEIGHT = 900


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


SERIF = "C:/Windows/Fonts/georgiab.ttf"
SANS = "C:/Windows/Fonts/arial.ttf"
SANS_BOLD = "C:/Windows/Fonts/arialbd.ttf"
MONO = "C:/Windows/Fonts/consola.ttf"


def gradient() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#071012")
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        mix = y / HEIGHT
        color = (
            int(7 + 9 * mix),
            int(16 + 18 * mix),
            int(18 + 16 * mix),
        )
        draw.line((0, y, WIDTH, y), fill=color)
    draw.ellipse((1120, -210, 1740, 410), fill="#123f3a")
    draw.ellipse((-330, 620, 350, 1300), fill="#3b2218")
    return image


def centered(draw: ImageDraw.ImageDraw, text: str, y: int, text_font, fill: str) -> None:
    box = draw.textbbox((0, 0), text, font=text_font)
    draw.text(((WIDTH - (box[2] - box[0])) / 2, y), text, font=text_font, fill=fill)


def title_card(title: str, subtitle: str, detail: str) -> Image.Image:
    image = gradient()
    draw = ImageDraw.Draw(image)
    centered(draw, "GENLAYER · STUDIONET", 185, font(SANS_BOLD, 25), "#77d8be")
    centered(draw, title, 270, font(SERIF, 76), "#f2efe5")
    centered(draw, subtitle, 382, font(SANS, 34), "#d4d6cd")
    draw.rounded_rectangle((305, 505, 1295, 586), 18, fill="#111f21", outline="#3f5e59", width=2)
    centered(draw, detail, 527, font(MONO, 24), "#a8bbb5")
    centered(draw, "Public evidence · independent judgment · deterministic settlement", 720, font(SANS, 25), "#bca992")
    return image


def screenshot_card(filename: str, step: str, headline: str, caption: str) -> Image.Image:
    image = gradient()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((42, 28, 1558, 872), 24, fill="#edf0e8", outline="#547b70", width=2)

    source = Image.open(ASSET_DIR / filename).convert("RGB")
    fitted = ImageOps.contain(source, (1470, 790), Image.Resampling.LANCZOS)
    x = (WIDTH - fitted.width) // 2
    y = 52
    image.paste(fitted, (x, y))

    draw.rounded_rectangle((72, 680, 1528, 840), 24, fill="#081315", outline="#41655d", width=2)
    draw.rounded_rectangle((102, 708, 250, 748), 20, fill="#b95531")
    draw.text((124, 716), step, font=font(SANS_BOLD, 18), fill="#fff7ea")
    draw.text((280, 700), headline, font=font(SERIF, 35), fill="#f5f1e5")
    draw.text((102, 770), caption, font=font(SANS, 24), fill="#cbd4ce")
    return image


def build() -> None:
    if FRAME_DIR.exists():
        shutil.rmtree(FRAME_DIR)
    FRAME_DIR.mkdir(parents=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    slides: list[tuple[Image.Image, int]] = [
        (
            title_card(
                "Hackathon Judge",
                "Natural-language judging, settled on-chain",
                "0x0bAE6f3aE56E02A50f5Bed0051F56ec28725a58F",
            ),
            6,
        ),
        (
            screenshot_card(
                "05-desktop-docket.png",
                "01",
                "A finalized StudioNet docket",
                "Two submissions, one appeal, one deterministic winner, and a released prize.",
            ),
            9,
        ),
        (
            screenshot_card(
                "07-desktop-evidence.png",
                "02",
                "Evidence is frozen before judging",
                "Validators independently render the page and agree on its exact SHA-256 digest.",
            ),
            9,
        ),
        (
            screenshot_card(
                "05-desktop-docket.png",
                "03",
                "Subjective judgment, narrow consensus",
                "Eligibility + score must match; confidence is bounded; rationale wording is exempt.",
            ),
            10,
        ),
        (
            screenshot_card(
                "08-desktop-appeal.png",
                "04",
                "One appeal, another immutable record",
                "The evidence-gap fixture adds its missing transaction, then validators reassess the frozen record.",
            ),
            9,
        ),
        (
            screenshot_card(
                "05-desktop-docket.png",
                "05",
                "Code settles the result",
                "Hackathon Judge scores 100; the 0.001 simulated GEN prize becomes withdrawable credit.",
            ),
            9,
        ),
        (
            title_card(
                "Rules → evidence → consensus",
                "Live now on GenLayer StudioNet",
                "hackathon-judge-studionet.blazekingsley2.chatgpt.site",
            ),
            8,
        ),
    ]

    concat_lines: list[str] = []
    for index, (slide, duration) in enumerate(slides):
        frame_path = FRAME_DIR / f"{index:02d}.png"
        slide.save(frame_path, optimize=True)
        concat_lines.extend((f"file '{frame_path.name}'", f"duration {duration}"))
    concat_lines.append(f"file '{len(slides) - 1:02d}.png'")

    concat_path = FRAME_DIR / "concat.txt"
    concat_path.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as exc:
        raise SystemExit(
            "imageio-ffmpeg is required. Install it into PYTHONPATH before running this script."
        ) from exc

    command = [
        ffmpeg,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concat_path.name,
        "-t",
        "60",
        "-vf",
        "fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        str(OUTPUT),
    ]
    subprocess.run(command, cwd=FRAME_DIR, check=True)
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
