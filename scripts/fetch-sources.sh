#!/usr/bin/env bash
set -euo pipefail
# Re-download the open-source sources used by scripts/build-data.mjs.
# Requires git, curl, python3 + pymupdf (for the 2026 408 paper/details extraction).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/data/raw"
TMP="${TMPDIR:-/tmp}/yantu-sources"
mkdir -p "$RAW" "$TMP"

clone() {
  local repo="$1" dir="$2"
  if [ ! -d "$TMP/$dir/.git" ]; then
    git clone --depth 1 "https://github.com/$repo.git" "$TMP/$dir"
  fi
}

clone gtqbhksl/22408 fourinone
clone Nishino0525Nanase/kaoyan-politics politics
clone neville-studio/408-exam-paper cs408
clone Echo1LZJY/echo-kaoyan-english-skill echoen

cp "$TMP/fourinone/math/exam_data.js" "$RAW/math-exam_data.js"
cp "$TMP/fourinone/408/questions_data.js" "$RAW/cs408-questions_data.js"
cp "$TMP/politics/dist/questions.json" "$RAW/politics.json"
rm -rf "$RAW/english-ii"
cp -r "$TMP/echoen/skills/kaoyan-english/references/papers/english-ii" "$RAW/english-ii"

# 2026 408 paper text + answer details (PDFs are rendered/extracted with pymupdf)
curl -sL -o "$TMP/cs408-details.pdf" \
  "https://github.com/CHNragdoll/anki-pipeline/releases/download/cs408-exams/all-cs408-answer-details.pdf"
python3 - "$TMP" "$RAW" <<'PY'
import sys, pymupdf
tmp, raw = sys.argv[1], sys.argv[2]
paper = pymupdf.open(f"{tmp}/cs408/papers-rebuild/2026.pdf")
open(f"{raw}/cs408-2026-paper.txt", "w").write("\n".join(p.get_text() for p in paper))
details = pymupdf.open(f"{tmp}/cs408-details.pdf")
start = None
for i, p in enumerate(details):
    t = p.get_text()
    if "2026 年全国硕士研究生招生考试" in t and "答案详解" in t:
        start = i
        break
if start is None:
    start = max(0, len(details) - 25)
open(f"{raw}/cs408-2026-details.txt", "w").write("\n".join(details[i].get_text() for i in range(start, len(details))))
PY

echo "Sources downloaded. Run: npm run data:build"
echo "Note: 2006 politics text is included in data/raw/politics-2006.txt (public 新东方 page)."
