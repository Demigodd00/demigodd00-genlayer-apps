"""Captioned v3 walkthrough from unmodified live-app screenshot captures.

Screenshots are fitted, not rewritten. A side panel explains each view. This is
a captioned slideshow, not a continuous recording or evidence of real adoption.
"""
import json
import subprocess
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'docs/assets/hackathon-judge-v3'
OUTPUT = ROOT / 'apps/hackathon-judge-web/public/hackathon-judge-v3-walkthrough.mp4'
WIDTH, HEIGHT = 1600, 900


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', size)


def frame(filename, number, title, body):
    canvas = Image.new('RGB', (WIDTH, HEIGHT), '#112025')
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 62), 'HACKATHON JUDGE / MILESTONE 1', font=font(24, True), fill='#d3ff31')
    draw.text((70, 155), number, font=font(42, True), fill='#d3ff31')
    y = 230
    for line in textwrap.wrap(title, 24):
        draw.text((70, y), line, font=font(44, True), fill='#f4f2e8')
        y += 54
    y += 30
    for line in textwrap.wrap(body, 42):
        draw.text((70, y), line, font=font(28), fill='#c6cfca')
        y += 39
    draw.text((70, 777), 'StudioNet / simulated GEN / controlled fixtures', font=font(22), fill='#d3ff31')
    draw.text((70, 820), 'Captioned walkthrough of live contract views', font=font(21), fill='#c6cfca')
    screenshot = Image.open(ASSETS / filename).convert('RGB')
    fitted = ImageOps.contain(screenshot, (700, 804), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (850 + (700 - fitted.width) // 2, 48 + (804 - fitted.height) // 2))
    return canvas


def main():
    demo = json.loads((ROOT / 'deployments/hackathon_judge_scorecards_v3_0_1_demo.json').read_text(encoding='utf-8'))
    assert demo.get('completed_at'), 'Capture completed live results first'
    result = demo['assertions']
    before = int(result['original_total_bps']) / 100
    after = int(result['final_total_bps']) / 100
    slides = [
        ('01-rubric-editor.png', '01', 'Lock the rubric', 'Organizers choose 2–4 prose criteria. Integer weights total 100% and cannot change after creation.'),
        ('02-initial-scorecard.png', '02', 'Inspect the first scorecard', f'The appeal fixture initially scored {before:g}/100. Every positive criterion includes checked references into frozen evidence.'),
        ('03-revised-scorecard.png', '03', 'Appeal one criterion', f'Reproducibility was reassessed using an authenticated addendum. The effective score is {after:g}/100. Other criteria and the original record remain unchanged.'),
        ('04-citation.png', '04', 'Follow the evidence', 'Expand a reference to read the exact captured text. Location and integrity checks do not guarantee that a claim or AI judgment is correct.'),
        ('05-finalized.png', '05', 'Settle after appeals close', 'Premature settlement was rejected. The common window closed, the winner was finalized, and 0.001 simulated GEN was withdrawn.'),
        ('03-revised-scorecard.png', '06', 'A new milestone, not a resubmission', 'v3 adds weighted scorecards, targeted appeals and immutable history. The accepted v2.3 contract remains unchanged. Public receipts document the new workflow.'),
    ]
    frame_dir = Path(tempfile.mkdtemp(prefix='hackathon-judge-v3-video-'))
    entries = []
    for index, slide in enumerate(slides):
        filename = f'{index:02d}.png'
        frame(*slide).save(frame_dir / filename)
        entries.extend([f"file '{filename}'", 'duration 10'])
    entries.append("file '05.png'")
    (frame_dir / 'concat.txt').write_text('\n'.join(entries) + '\n', encoding='utf-8')
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
                    '-t', '60', '-vf', 'fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium',
                    '-crf', '20', '-movflags', '+faststart', str(OUTPUT)], cwd=frame_dir, check=True)
    print(json.dumps({'video': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'seconds': 60, 'frames_directory': str(frame_dir)}))


if __name__ == '__main__':
    main()
