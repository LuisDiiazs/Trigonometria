import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent
AUXILIARY_DIR = ROOT
IMAGES_DIR = ROOT

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9333
profile = tempfile.mkdtemp(prefix="trigo-cdp-")

proc = subprocess.Popen([
    CHROME,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={profile}",
    "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=1) as response:
                targets = json.load(response)
            break
        except Exception:
            time.sleep(0.2)
    else:
        raise SystemExit("Chrome nao iniciou")

    page = next(t for t in targets if t.get("type") == "page")
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=20)
    counter = 0

    def send(method, params=None):
        nonlocal_counter[0] += 1
        message_id = nonlocal_counter[0]
        ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            data = json.loads(ws.recv())
            if data.get("id") == message_id:
                if "error" in data:
                    raise RuntimeError(f"{method}: {data['error']}")
                return data.get("result", {})

    nonlocal_counter = [0]
    send("Page.enable")
    send("Runtime.enable")

    scenarios = json.loads(sys.argv[1]) if len(sys.argv) > 1 else [
        {"name": "desktop", "width": 1200, "height": 800, "dpr": 1, "url": "http://127.0.0.1:5173/_visual.html"},
        {"name": "desktopgraph", "width": 1200, "height": 800, "dpr": 1, "url": "http://127.0.0.1:5173/_visual.html#graph"},
        {"name": "desktopzoom", "width": 1200, "height": 800, "dpr": 1, "url": "http://127.0.0.1:5173/_visual.html#zoom3"},
        {"name": "mobile390", "width": 390, "height": 844, "url": "http://127.0.0.1:5173/_visual.html"},
        {"name": "mobile390panel", "width": 390, "height": 844, "url": "http://127.0.0.1:5173/_visual.html#panel"},
        {"name": "mobile390table", "width": 390, "height": 844, "url": "http://127.0.0.1:5173/_visual.html#table"},
        {"name": "mobile390zoom", "width": 390, "height": 844, "url": "http://127.0.0.1:5173/_visual.html#zoom3"},
        {"name": "mobile390graph", "width": 390, "height": 844, "url": "http://127.0.0.1:5173/_visual.html#graph"},
        {"name": "mobile360", "width": 360, "height": 740, "url": "http://127.0.0.1:5173/_visual.html"},
    ]

    for scenario in scenarios:
        send("Emulation.setDeviceMetricsOverride", {
            "width": scenario["width"],
            "height": scenario["height"],
            "deviceScaleFactor": scenario.get("dpr", 2),
            "mobile": scenario.get("dpr", 2) != 1,
        })
        url = scenario["url"]
        if "?" not in url:
            base, sep, frag = url.partition("#")
            url = f"{base}?run={scenario['name']}" + (f"#{frag}" if sep else "")
        send("Page.navigate", {"url": url})
        time.sleep(1.6)

        info = send("Runtime.evaluate", {
            "expression": """(() => {
              const c = document.getElementById('canvas');
              const r = c.getBoundingClientRect();
              const tb = document.querySelector('.topbar');
              const actions = document.querySelector('.topbarActions').getBoundingClientRect();
              return JSON.stringify({
                innerWidth, innerHeight, dpr: devicePixelRatio,
                canvas: {left: r.left, top: r.top, width: r.width, height: r.height},
                mq480: matchMedia('(max-width: 480px)').matches,
                mq720: matchMedia('(max-width: 720px)').matches,
                mq900: matchMedia('(max-width: 900px)').matches,
                topbarScroll: tb.scrollWidth, topbarClient: tb.clientWidth,
                actions: {left: actions.left, right: actions.right, width: actions.width},
                panelOpen: document.getElementById('panel').classList.contains('open'),
                brand: getComputedStyle(document.querySelector('.brandText')).display
              });
            })()""",
            "returnByValue": True,
        })["result"]["value"]
        (AUXILIARY_DIR / f"_{scenario['name']}.json").write_text(info, encoding="utf-8")

        shot = send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        (IMAGES_DIR / f"shot-generated-{scenario['name']}.png").write_bytes(base64.b64decode(shot["data"]))
        print(scenario["name"], info)

    send("Browser.close")
    ws.close()
finally:
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
