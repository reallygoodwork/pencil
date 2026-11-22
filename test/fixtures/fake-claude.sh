#!/bin/sh
# Stand-in for `claude -p` used by tests and demo recordings. Makes the edit the
# demo notes ask for, then prints one "<id>: summary" line per annotation, like Claude.
PROMPT="$2"
[ -n "$FAKE_CLAUDE_LOG" ] && printf '%s' "$PROMPT" > "$FAKE_CLAUDE_LOG"
sleep "${FAKE_CLAUDE_DELAY:-2}"
if echo "$PROMPT" | grep -qi "orange"; then
  sed -i.bak 's/.btn-primary{background:var(--ink);color:var(--paper)}/.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}/' styles.css 2>/dev/null && rm -f styles.css.bak
  SUMMARY="Primary button now uses the brand orange (styles.css)."
elif echo "$PROMPT" | grep -qi "shorter\|punchier"; then
  sed -i.bak 's/Paper that keeps up with you./Keep up./' index.html 2>/dev/null && rm -f index.html.bak
  SUMMARY='Shortened the headline to "Keep up."'
else
  SUMMARY="Fake agent: nothing changed. It only knows two demo notes: circle the headline and say \"shorter\", or circle Shop notebooks and say \"orange\". Run the demo without --fake for real edits."
fi
echo "Looked through the project."
echo "$PROMPT" | grep -o '^\[ann_[A-Za-z0-9_-]*\]' | tr -d '[]' | while read -r id; do echo "$id: $SUMMARY"; done
