import html
import re
from pathlib import Path

auxiliary_dir = Path(__file__).resolve().parent
text = (auxiliary_dir / "_dump.html").read_text(encoding="utf-8-sig")
match = re.search(r'<pre id="__testout">(.*?)</pre>', text, re.S)
if not match:
    (auxiliary_dir / "_result.txt").write_text("NOT FOUND", encoding="utf-8")
else:
    (auxiliary_dir / "_result.txt").write_text(html.unescape(match.group(1)), encoding="utf-8")
print("done")
