import os
import requests

TRANSLATE_URL = (
    "https://router.huggingface.co/hf-inference/models/"
    "Helsinki-NLP/opus-mt-zh-en"
)
EMOTION_URL = (
    "https://router.huggingface.co/hf-inference/models/"
    "SamLowe/roberta-base-go_emotions/pipeline/text-classification"
)

# ── Junto Emotion Wheel mapping ─────────────────────────────────────────────
# GoEmotions label → (core_en, layer2_zh, layer2_en)
GO_TO_WHEEL = {
    # FEAR
    'fear':           ('FEAR',     '害怕',    'Scared'),
    'nervousness':    ('FEAR',     '焦虑',    'Anxious'),
    'embarrassment':  ('FEAR',     '不安',    'Insecure'),
    # ANGER
    'anger':          ('ANGER',    '愤怒',    'Mad'),
    'annoyance':      ('ANGER',    '烦躁',    'Frustrated'),
    'disapproval':    ('ANGER',    '批判',    'Critical'),
    'disappointment': ('ANGER',    '失望',    'Let Down'),
    # DISGUST
    'disgust':        ('DISGUST',  '厌恶',    'Repelled'),
    'remorse':        ('DISGUST',  '懊悔',    'Awful'),
    # SADNESS
    'sadness':        ('SADNESS',  '悲伤',    'Despair'),
    'grief':          ('SADNESS',  '悲痛',    'Grief'),
    # SURPRISE
    'surprise':       ('SURPRISE', '惊讶',    'Startled'),
    'confusion':      ('SURPRISE', '困惑',    'Confused'),
    'realization':    ('SURPRISE', '顿悟',    'Amazed'),
    'curiosity':      ('SURPRISE', '好奇',    'Amazed'),
    # JOY
    'joy':            ('JOY',      '喜悦',    'Content'),
    'amusement':      ('JOY',      '愉快',    'Playful'),
    'excitement':     ('JOY',      '兴奋',    'Excited'),
    'relief':         ('JOY',      '如释重负', 'Peaceful'),
    'pride':          ('JOY',      '自豪',    'Proud'),
    'optimism':       ('JOY',      '乐观',    'Optimistic'),
    'gratitude':      ('JOY',      '感恩',    'Peaceful'),
    # LOVE
    'love':           ('LOVE',     '爱',      'Close'),
    'admiration':     ('LOVE',     '钦佩',    'Accepted'),
    'caring':         ('LOVE',     '关爱',    'Safe'),
    'desire':         ('LOVE',     '渴望',    'Close'),
    'approval':       ('LOVE',     '认可',    'Accepted'),
    # NEUTRAL (excluded from wheel)
    'neutral':        ('NEUTRAL',  '平静',    'Neutral'),
}

CORE_ORDER  = ['FEAR', 'ANGER', 'DISGUST', 'SADNESS', 'SURPRISE', 'JOY', 'LOVE']
CORE_ZH     = {
    'FEAR': '恐惧', 'ANGER': '愤怒', 'DISGUST': '厌恶',
    'SADNESS': '悲伤', 'SURPRISE': '惊讶', 'JOY': '喜悦', 'LOVE': '爱',
    'NEUTRAL': '平静',
}
CORE_COLORS = {
    'FEAR':     '#8B5CF6',
    'ANGER':    '#EF4444',
    'DISGUST':  '#10B981',
    'SADNESS':  '#60A5FA',
    'SURPRISE': '#F59E0B',
    'JOY':      '#FB923C',
    'LOVE':     '#F472B6',
}
SUMMARY_TEMPLATES = {
    'FEAR':     '你现在感到{zh}，有些事情让你感到不安或受到威胁。',
    'ANGER':    '你现在感到{zh}，有些事情触怒或让你感到沮丧。',
    'DISGUST':  '你现在感到{zh}，有些事情让你难以接受。',
    'SADNESS':  '你现在感到{zh}，有些沉重的事情压在心上。',
    'SURPRISE': '你现在感到{zh}，有些事情出乎你的意料。',
    'JOY':      '你现在感到{zh}，有些事情让你心情不错。',
    'LOVE':     '你现在感受到{zh}的温暖，与某人或某事有深度连接。',
    'NEUTRAL':  '你现在情绪比较平稳，但心里还是有一些想说的话。',
}

SUB_SHOW_THRESHOLD   = 0.03   # min score for a GoEmotions label to appear in L2/L3
LABEL_SHOW_THRESHOLD = 0.02   # min core score for emotion_labels tags


def translate_to_english(text: str, token: str) -> str:
    """Translate (presumably Chinese) text to English before emotion analysis."""
    headers = {'Authorization': f'Bearer {token}'}
    try:
        resp = requests.post(
            TRANSLATE_URL,
            headers=headers,
            json={'inputs': text},
            timeout=20,
        )
        resp.raise_for_status()
        result = resp.json()
        if isinstance(result, list) and result:
            translated = result[0].get('translation_text', text)
            print(f"\n[TRANSLATION]")
            print(f"  原文 : {text[:120]}")
            print(f"  译文 : {translated}")
            return translated
        print(f"[TRANSLATION] unexpected format: {result}")
    except Exception as e:
        print(f"[TRANSLATION ERROR] {e}")
    return text   # fallback: send original


def analyze_emotion(text: str) -> dict:
    token = os.getenv('HF_TOKEN', '')
    if not token:
        return {'error': '未配置 HF_TOKEN，请在 .env 文件中填入你的 Hugging Face token'}

    # ── Step 1: translate to English ───────────────────────────────────────
    english_text = translate_to_english(text, token)

    # ── Step 2: GoEmotions classification ──────────────────────────────────
    headers = {'Authorization': f'Bearer {token}'}
    try:
        resp = requests.post(
            EMOTION_URL,
            headers=headers,
            json={'inputs': english_text, 'parameters': {'top_k': 28}},
            timeout=20,
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        return {'error': '模型响应超时，请稍后重试'}
    except requests.exceptions.RequestException as e:
        return {'error': f'API 请求失败：{e}'}

    raw = resp.json()
    if isinstance(raw, list) and raw:
        emotions = raw[0] if isinstance(raw[0], list) else raw
    else:
        return {'error': f'意外的 API 响应格式：{raw}'}

    # Debug: print all GoEmotions scores
    print("\n[GO_EMOTIONS] top results:")
    for item in sorted(emotions, key=lambda x: x['score'], reverse=True)[:10]:
        print(f"  {item['label']:20s} {item['score']:.4f}")

    # ── Step 3: build 3-layer Junto wheel data ──────────────────────────────
    wheel_data = {
        core: {'zh': CORE_ZH[core], 'color': CORE_COLORS[core],
               'score': 0.0, 'sub': [], '_scores': []}
        for core in CORE_ORDER
    }

    for item in emotions:
        label = item['label']
        score = item['score']
        if label not in GO_TO_WHEEL:
            continue
        core, zh_l2, en_l2 = GO_TO_WHEEL[label]
        if core == 'NEUTRAL':
            continue
        wheel_data[core]['_scores'].append(score)
        if score >= SUB_SHOW_THRESHOLD:
            wheel_data[core]['sub'].append(
                {'label': label, 'zh': zh_l2, 'en': en_l2, 'score': round(score, 3)}
            )

    for core in CORE_ORDER:
        all_s = wheel_data[core].pop('_scores', [])
        wheel_data[core]['score'] = round(max(all_s, default=0.0), 3)
        wheel_data[core]['sub'].sort(key=lambda x: x['score'], reverse=True)

    # ── Step 4: derive summary & metadata ──────────────────────────────────
    dominant_core = max(CORE_ORDER, key=lambda c: wheel_data[c]['score'])
    primary_zh    = CORE_ZH[dominant_core]

    summary = SUMMARY_TEMPLATES.get(dominant_core, '你现在有{zh}的感受。').format(zh=primary_zh)
    secondary = [c for c in CORE_ORDER if c != dominant_core and wheel_data[c]['score'] > 0.08]
    if secondary:
        summary += '其中也夹杂着一些' + '、'.join(CORE_ZH[c] for c in secondary[:2]) + '。'

    trigger = _extract_trigger(text)

    emotion_labels = sorted(
        [{'label': CORE_ZH[c], 'color': CORE_COLORS[c], 'score': wheel_data[c]['score']}
         for c in CORE_ORDER if wheel_data[c]['score'] > LABEL_SHOW_THRESHOLD],
        key=lambda x: x['score'], reverse=True,
    )

    return {
        'emotion_summary':  summary,
        'emotion_labels':   emotion_labels,
        'trigger':          trigger,
        'primary_emotion':  primary_zh,
        'primary_core':     dominant_core,
        'wheel_data':       {k: {kk: vv for kk, vv in v.items()} for k, v in wheel_data.items()},
        'translated_text':  english_text,   # returned for frontend debug display
    }


def _extract_trigger(text: str) -> str:
    for sep in ['。', '！', '？', '…', '\n']:
        for part in text.split(sep):
            part = part.strip()
            if len(part) >= 4:
                return part[:80] + ('……' if len(part) > 80 else '')
    return text[:80] + ('……' if len(text) > 80 else '')
