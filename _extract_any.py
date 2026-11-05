import html
import re
import sys
from pathlib import Path

source, element_id, target = sys.argv[1], sys.argv[2], sys.argv[3]
text = Path(source).read_text(encoding="utf-8-sig")
match = re.search(r'<pre id="' + re.escape(element_id) + r'">(.*?)</pre>', text, re.S)
Path(target).write_text(html.unescape(match.group(1)) if match else "NOT FOUND", encoding="utf-8")
print("ok")
