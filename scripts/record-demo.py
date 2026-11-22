#!/usr/bin/env python3
"""Record the landing-page clips and stills from the demo app.

Needs Playwright (pip install playwright && playwright install chromium) and ffmpeg.
Run `npm run demo -- --fake` in another terminal first (or drop --fake to film real Claude Code).

  python3 scripts/record-demo.py ipad    # circles the headline, asks for shorter copy
  python3 scripts/record-demo.py phone   # circles the button, asks for brand orange

Writes site/media/<kind>.mp4, <kind>-poster.jpg and <kind>-{compose,working,done}.jpg.
Restart the demo between recordings so each starts from the original page.
"""
import math, os, shutil, subprocess, sys, tempfile, glob
from playwright.sync_api import sync_playwright

KINDS = {
    "ipad":  dict(vp={"width": 1180, "height": 820}, sel=".headline",    note="Make this shorter and punchier", chip="change", pad=(30, 26)),
    "phone": dict(vp={"width": 390,  "height": 844}, sel=".btn-primary", note="Make this our brand orange",     chip="fix",    pad=(22, 22)),
}
kind = sys.argv[1] if len(sys.argv) > 1 else "ipad"
cfg = KINDS[kind]
url = os.environ.get("DEMO_URL", "http://localhost:5173/")
media = os.path.join(os.path.dirname(__file__), "..", "site", "media")
tmp = tempfile.mkdtemp()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport=cfg["vp"], device_scale_factor=2, has_touch=True, record_video_dir=tmp, record_video_size=cfg["vp"])
    page = ctx.new_page()
    page.goto(url); page.wait_for_timeout(1500)
    page.click("#pa-btn"); page.wait_for_timeout(700)
    box = page.locator(cfg["sel"]).bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    rx, ry = box["width"] / 2 + cfg["pad"][0], box["height"] / 2 + cfg["pad"][1]
    page.mouse.move(cx + rx * math.cos(-0.3), cy + ry * math.sin(-0.3)); page.mouse.down()
    for i in range(70):
        a = -0.3 + i / 69 * 2.25 * math.pi
        page.mouse.move(cx + rx * math.cos(a) * (1 + 0.04 * math.sin(3 * a)), cy + ry * math.sin(a)); page.wait_for_timeout(12)
    page.mouse.up(); page.wait_for_timeout(600)
    page.click(f"#pa-compose .pa-meta button[data-v={cfg['chip']}]"); page.wait_for_timeout(300)
    page.click("#pa-compose textarea"); page.keyboard.type(cfg["note"], delay=55); page.wait_for_timeout(700)
    page.screenshot(path=f"{tmp}/compose.png")
    page.click("#pa-compose .go"); page.wait_for_timeout(2600)
    page.screenshot(path=f"{tmp}/working.png")
    page.wait_for_timeout(5700)
    page.screenshot(path=f"{tmp}/done.png")
    page.wait_for_timeout(2500)
    ctx.close(); browser.close()

webm = glob.glob(f"{tmp}/*.webm")[0]
mp4 = os.path.join(media, f"{kind}.mp4")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", "0.6", "-i", webm, "-an", "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4], check=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-sseof", "-1", "-i", mp4, "-frames:v", "1", "-q:v", "3",
                os.path.join(media, f"{kind}-poster.jpg")], check=True)
for s in ("compose", "working", "done"):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{tmp}/{s}.png", "-q:v", "3", os.path.join(media, f"{kind}-{s}.jpg")], check=True)
shutil.rmtree(tmp)
print(f"Wrote site/media/{kind}.mp4 and stills")
