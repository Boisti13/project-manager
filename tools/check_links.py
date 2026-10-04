"""Checks the relative links in the Markdown docs: that linked files exist
and that #anchors match a heading (GitHub's way of making anchors).

    python tools/check_links.py        # exit code 1 if anything is broken
"""
import glob
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["README.md", "DEPLOYMENT.md", "CHANGELOG.md", "CLAUDE.md", "desktop/README.md", "desktop/CHANGELOG.md"] + \
    sorted(os.path.relpath(p, REPO).replace(os.sep, "/") for p in glob.glob(os.path.join(REPO, "docs", "*.md")))


def anchors(path):
    out = set()
    in_code = False
    for line in open(path, encoding="utf-8"):
        if line.startswith("```"):
            in_code = not in_code
        m = None if in_code else re.match(r"^#+\s+(.*)", line)
        if m:
            a = m.group(1).strip().lower()
            out.add(re.sub(r"[^\w\- ]", "", a).replace(" ", "-"))
    return out


def main():
    bad = 0
    for f in FILES:
        p = os.path.join(REPO, f)
        if not os.path.exists(p):
            continue
        base = os.path.dirname(p)
        text = re.sub(r"```.*?```", "", open(p, encoding="utf-8").read(), flags=re.S)  # not in code blocks
        for m in re.finditer(r"\]\(([^)\s]+)\)", text):
            link = m.group(1)
            if link.startswith(("http", "mailto")):
                continue
            target, _, frag = link.partition("#")
            tp = os.path.normpath(os.path.join(base, target)) if target else p
            if not os.path.exists(tp):
                print(f, "MISSING", link)
                bad += 1
            elif frag and tp.endswith(".md") and frag not in anchors(tp):
                print(f, "ANCHOR", link)
                bad += 1
    print("problems:", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
