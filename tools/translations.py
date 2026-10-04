"""German texts (frontend/src/locales/de.js): add or change entries without
hand-editing the sorted file, and find texts that still lack a translation.

    python tools/translations.py missing             # t()/tn() keys without German
    python tools/translations.py add new.json        # {"English": "Deutsch", …}
    python tools/translations.py remove "Old text"   # entries no longer used

The keys are the English texts exactly as in t('…') / tn(n, '…', '…')
(including typographic quotes and dashes). The frontend test
src/i18n.test.js fails when a t() key has no German entry.
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "frontend", "src")
DE = os.path.join(SRC, "locales", "de.js")
LINE = re.compile(r'^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$')
HEADER = ["// German interface texts, keyed by the English text (see src/i18n.js).",
          "// Generated and kept sorted; i18n.test.js checks it covers every t()/tn() key."]


def read():
    entries = {}
    for line in open(DE, encoding="utf-8").read().splitlines():
        m = LINE.match(line)
        if m:
            entries[json.loads(m.group(1))] = json.loads(m.group(2))
    return entries


def write(entries):
    out = HEADER + ["const de = {"]
    for k in sorted(entries, key=str.lower):
        out.append(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(entries[k], ensure_ascii=False)},")
    out += ["};", "", "export default de;"]
    with open(DE, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    print("de.js:", len(entries), "entries")


# t('…'), t("…"), tn(n, '…', '…') -- string literals only
CALL = re.compile(r"""\b(t|tn)\(\s*(?:[^,()'"]+,\s*)?('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(?:\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?""")


def _literal(s):
    body = s[1:-1]
    if s[0] == "'":
        body = body.replace("\\'", "'").replace('"', '\\"')
    return json.loads('"' + body + '"')


def used_keys():
    keys = set()
    for root, _, files in os.walk(SRC):
        for name in files:
            if name.endswith(".js") and not name.endswith(".test.js") and "locales" not in root:
                text = open(os.path.join(root, name), encoding="utf-8").read()
                for m in CALL.finditer(text):
                    keys.add(_literal(m.group(2)))
                    if m.group(1) == "tn" and m.group(3):
                        keys.add(_literal(m.group(3)))
    return keys


def main(args):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
    if not args or args[0] not in ("missing", "add", "remove"):
        sys.exit(__doc__)
    entries = read()
    if args[0] == "missing":
        missing = sorted(used_keys() - set(entries))
        for k in missing:
            print(json.dumps(k, ensure_ascii=False))
        print(len(missing), "missing")
        return 1 if missing else 0
    if args[0] == "add":
        new = json.load(open(args[1], encoding="utf-8"))
        for k, v in new.items():
            if k in entries and entries[k] != v:
                print("changed:", json.dumps(k, ensure_ascii=False), "->", json.dumps(v, ensure_ascii=False))
            entries[k] = v
        write(entries)
        return 0
    for k in args[1:]:
        if entries.pop(k, None) is None:
            print("not there:", k)
    write(entries)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
