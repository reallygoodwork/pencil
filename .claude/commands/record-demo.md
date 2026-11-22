---
description: Re-record the landing page videos and stills from the demo app
argument-hint: "[ipad|phone|both] [--real]"
---

Re-record the landing-page media: $ARGUMENTS (default: both, fake agent).

For each clip (ipad, then phone):
1. Start the demo in the background: `npm run demo -- --fake`, or `npm run demo` with `--real` to film real Claude Code edits. Wait until http://localhost:5173 responds.
2. Run `python3 scripts/record-demo.py <kind>`. It needs Playwright with Chromium, and ffmpeg. Install them if missing.
3. Stop the demo before the next clip, so each recording starts from the original page.

Then confirm that `site/media/` has the new files and that `site/index.html` still points at them. Report file sizes. Keep each video under 1 MB.
