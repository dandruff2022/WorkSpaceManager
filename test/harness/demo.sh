#!/bin/sh
# Builds ui/_demo.html: the real manager page with ext_shim.js, to open at http://localhost:8765/ui/_demo.html?mode=window
cd "$(dirname "$0")/../.." || exit 1
sed "s#<script src=\"../utils/site_profiles_registry.js\" defer></script>#<script src=\"../test/harness/ext_shim.js?v=$(date +%s)\"></script>&#" ui/manager.html > ui/_demo.html
echo "http://localhost:8765/ui/_demo.html?mode=window"
