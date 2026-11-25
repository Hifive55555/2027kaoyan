#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${EXTERNAL_DIR:-$ROOT/.cache/external}"
mkdir -p "$DEST"
REPOS=(
  zhangyu-1000t kaoyan-vocab zhangyu-math-zero-basics kaoyan-408-networks
  relax-1000 kaoyan-vocab5 data-structure-site zhangyu-30jiang-selfstudy
  kaoyan-408-ds kaoyan-408-os english-sentences sanda-jisuan kaoyan-408-coa
  kira-past-papers
)
for repo in "${REPOS[@]}"; do
  if [ -d "$DEST/$repo/.git" ]; then
    echo "✓ $repo"
  else
    echo "→ clone $repo"
    git clone --depth 1 -q "https://github.com/jlshdsdk/$repo.git" "$DEST/$repo"
  fi
done
echo "sources: $DEST"
