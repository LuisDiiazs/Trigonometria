from pathlib import Path

root = Path(__file__).resolve().parent
auxiliary_dir = root
html = (root / "index.html").read_text(encoding="utf-8")
old = '<script src="app.js" defer></script>'
new = '<script src="app.js" defer></script>\n  <script src="_visual.js" defer></script>'
assert old in html
(auxiliary_dir / "_visual.html").write_text(html.replace(old, new), encoding="utf-8")
print("ok")
