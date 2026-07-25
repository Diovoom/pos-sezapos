#!/usr/bin/env sh
set -eu
ROOT="${1:-.}"

[ -f "$ROOT/package.json" ] && [ -d "$ROOT/src" ] || {
  echo "Not a SEZA POS project: $ROOT" >&2
  exit 1
}

echo "Cleaning SEZA POS at $ROOT"

rm -rf \
  "$ROOT/.eslintcache" \
  "$ROOT/android-webdir" \
  "$ROOT/dist" \
  "$ROOT/dist-ssr" \
  "$ROOT/.output" \
  "$ROOT/.vinxi" \
  "$ROOT/android/.gradle" \
  "$ROOT/android/build" \
  "$ROOT/android/app/build"

# Old release packages occasionally contained a complete project inside the
# active project. Remove only directories matching the known patch pattern.
find "$ROOT" -maxdepth 1 -type d -name 'SEZA-POS-v*-PRODUCTION-PATCH' -exec rm -rf {} +

find "$ROOT" -type f \( -name '*.bak' -o -name '*.backup' -o -name '*.orig' -o -name '*~' \) -delete

for stale in \
  APPLY-PATCH.ps1 \
  APPLY-SEZA-HOMEPAGE-UPDATE.bat \
  INSTALL-SEZA-1.2.0.bat \
  PATCH-FILES.json \
  PATCH-MANIFEST.md \
  ROLLBACK-INSTRUCTIONS.md \
  SEZA-1.2.1-UPDATE.txt \
  SEZA-1.2.2-CHANGED-FILES.txt \
  SEZA-1.2.2-RELIABILITY-UPDATE.txt \
  SEZA-GOOGLE-OAUTH-BRANDING.md \
  SEZA-HOMEPAGE-UPDATE.md \
  SEZA-MAJOR-UPDATE.md \
  SHA256SUMS.txt \
  SOURCE-AUDIT.md \
  VALIDATION-RESULTS.md \
  apply-seza-dashboard-recovery-v2.ps1 \
  apply-seza-final-dashboard-fix.ps1 \
  apply-seza-roles-permissions-fix.ps1
do
  rm -f "$ROOT/$stale"
done

echo "Cleanup complete. Environment files were not touched."
