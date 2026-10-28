#!/bin/sh
# DOM acceptance checks against fake data, using installed headless Chrome (no dependencies).
# Optional argument: dark (default: light).
cd "$(dirname "$0")/../.." || exit 1
trap 'rm -f ui/_check.html' EXIT
sed 's#<script src="../utils/site_profiles_registry.js" defer></script>#<script src="../utils/project_store.js"></script><script src="../utils/workflow_prompts.js"></script><script src="../test/ui_preview/stub.js"></script><script src="../test/ui_preview/check.js" defer></script>&#' ui/manager.html > ui/_check.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files \
  --force-prefers-color-scheme="${1:-light}" --blink-settings=preferredColorScheme=$([ "${1:-light}" = dark ] && echo 0 || echo 1) \
  --virtual-time-budget=18000 --dump-dom "file://$PWD/ui/_check.html?mode=window#checks" > /tmp/wm_preview_checks.html 2>/dev/null
python3 - <<'PY'
from html import unescape
from pathlib import Path
import re
text = Path('/tmp/wm_preview_checks.html').read_text()
result = re.search(r'<pre id="checks-output">(.*?)</pre>', text, re.S)
print(unescape(result[1]) if result else 'FAIL: acceptance script did not finish')
raise SystemExit(0 if 'data-checks="passed"' in text else 1)
PY
