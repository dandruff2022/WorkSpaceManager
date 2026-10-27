#!/bin/sh
# Headless screenshots of the Projects screen with fake data: light/dark x window/panel width, plus states.
# Usage: sh test/ui_preview/run.sh  → PNGs in /tmp/wm_preview/
cd "$(dirname "$0")/../.." || exit 1
OUT=/tmp/wm_preview; mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Copy of manager.html with the stub injected before the app scripts
sed 's#<script src="../utils/site_profiles_registry.js" defer></script>#<script src="../utils/project_store.js"></script><script src="../utils/workflow_prompts.js"></script><script src="../test/ui_preview/stub.js"></script>&#' ui/manager.html > ui/_preview.html
shot() { # name width height page scheme
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
    --force-prefers-color-scheme=$5 --blink-settings=preferredColorScheme=$([ "$5" = dark ] && echo 0 || echo 1) \
    --allow-file-access-from-files --window-size=$2,$3 --screenshot="$OUT/$1.png" "file://$PWD/ui/$4" 2>/dev/null
}
# Headless Chrome has a minimum window width, so side-panel-width shots load the page in a 380px iframe
panel() { # name height hash scheme
  echo "<body style=\"margin:0;background:#888\"><iframe src=\"_preview.html?mode=window$3\" width=380 height=$2 style=\"border:0\"></iframe>" > ui/_frame.html
  shot "$1" 600 "$2" _frame.html "$4"
}
shot window-light 850 1400 "_preview.html?mode=window" light
shot window-dark 850 1400 "_preview.html?mode=window" dark
shot updated-light 850 1500 "_preview.html?mode=window#updated" light
shot empty-light 850 600 "_preview.html?mode=window#empty" light
panel panel-light 1600 "" light
panel updated-dark-panel 1700 "#updated" dark
rm -f ui/_preview.html ui/_frame.html
ls "$OUT"
