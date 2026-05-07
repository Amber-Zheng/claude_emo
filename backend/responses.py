import random

# Each choice maps to several response templates.
# {emotion} is replaced with the primary emotion label in Chinese.
# {text_hint} is optionally used but always has a fallback.

RESPONSES = {
    'F1': [  # 接受它
        '你现在感到{emotion}，这是真实存在的感受。不需要解释它，也不需要赶走它——它在这里，你也在这里，这就够了。',
        '有{emotion}的感受，是完全可以的。它不代表你做错了什么，只是此刻的你正在经历这些。',
        '{emotion}是真实的，你的感受是真实的。试着对自己说：「我现在感到{emotion}，这没关系。」',
    ],
    'F2': [  # 放下它
        '这件事已经发生了，它属于过去。你可以把{emotion}的感受轻轻放下，不是忘记，而是不再让它占据现在。',
        '你不需要一直抱着这份{emotion}。试着想象把它装进一个盒子，合上盖子，放到身后的架子上。',
        '反复回想只会让{emotion}变重。你已经感受过它了，这就足够了——现在可以往前走一步了。',
    ],
    'F3': [  # 重新理解它
        '你感到{emotion}，可能是因为你在乎。在乎本身是一种力量，只是有时候它压得我们有点喘不过气。',
        '也许这件事还有另一个角度：它不是专门针对你，而是它自己的一种运转方式。你的{emotion}是真实的，但故事可能不止这一个版本。',
        '感到{emotion}说明你对自己有期待，或者你在乎某段关系、某件事的结果。这份在意背后，藏着你真正重视的东西是什么？',
    ],
    'F4': [  # 说出来
        '你可以这样开口：「我最近有些{emotion}，有件事让我很难受，我只是想说出来。」不需要对方给答案，被听见本身就是疗愈。',
        '试试发一条消息给你信任的人：「我今天感到{emotion}，能陪我说说话吗？」——你不需要解释太多，真正在乎你的人会明白的。',
        '「我有点{emotion}，不知道该怎么说，但我需要有人在。」有时候，说出来的第一句话不需要很完整。',
    ],
    'F5': [  # 暂时不处理
        '你不需要现在就解决这一切。{emotion}的感受可以先放在这里，等你准备好了再去看它——这不是逃避，是对自己的温柔。',
        '有时候，最好的做法就是暂停。你感到{emotion}，但你不必今天找到答案。给自己一点时间，没关系的。',
        '允许自己说「我现在处理不了」是需要勇气的。把{emotion}先放下，去做一件让自己舒服的小事吧。',
    ],
    'F6': [  # 转化为一个小行动
        '现在，做一件很小的事：站起来，倒一杯水，慢慢喝完它。让身体先回到当下，{emotion}的感受会跟着松动一点。',
        '试试这个：拿出一张纸，写下「我今天感到{emotion}」，然后在下面写一件你今天做到的小事，不管多微不足道。',
        '给自己五分钟：离开屏幕，去窗边站一会儿，看看外面。{emotion}的感受不会消失，但你可以带着它，先回到现实里来。',
    ],
}


def get_response(choice: str, emotion: str, text: str = '') -> str:
    templates = RESPONSES.get(choice, ['{emotion}的感受被我收到了，谢谢你愿意说出来。'])
    template = random.choice(templates)
    return template.format(emotion=emotion or '复杂的情绪', text_hint=text[:20] if text else '')
