import json
from datetime import datetime, timezone
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / 'data' / 'mars_particles.json'

# Maps user choice → particle behavior name
CHOICE_TO_BEHAVIOR = {
    'F1': 'stable',    # 接受它   → 稳定留存
    'F2': 'dissolve',  # 放下它   → 慢慢消散 (not stored)
    'F3': 'recolor',   # 重新理解 → 变色留下
    'F4': 'flyaway',   # 说出来   → 化光飞走 (not stored)
    'F5': 'float',     # 暂时不处理 → 漂浮不定
    'F6': 'root',      # 转化为行动 → 落地生根
}

# F3 recolor: emotion color → understanding color stored on Mars
RECOLOR_TARGET = '#c8b8ff'   # soft lavender

# Only these behaviors leave a permanent mark on Mars
PERSISTENT = {'stable', 'recolor', 'float', 'root'}


def add_particle(core: str, color: str, choice: str) -> list:
    behavior = CHOICE_TO_BEHAVIOR.get(choice, 'stable')
    particles = get_particles()
    if behavior in PERSISTENT:
        stored_color = RECOLOR_TARGET if behavior == 'recolor' else color
        particles.append({
            'core':     core,
            'color':    stored_color,
            'behavior': behavior,
            'ts':       datetime.now(timezone.utc).isoformat(),
        })
        DATA_FILE.parent.mkdir(exist_ok=True)
        DATA_FILE.write_text(json.dumps(particles, ensure_ascii=False))
    return particles


def get_particles() -> list:
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return []
