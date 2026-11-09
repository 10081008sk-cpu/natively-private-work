import re
from collections import Counter

try:
    from repetition_filter import is_repetition_hallucination
except Exception:
    from repetition_filter import is_repetition_hallucination

BAD_PHRASES = [
    "i'm sorry",
    "i am sorry",
    "you're not going to",
    "you are not going to",
    "a little bit",
    "it's a lot of work",
    "it is a lot of work",
    "i'm going to",
    "i am going to",
    "thank you very much",
]


def repetition_ratio(text: str) -> float:
    words = text.lower().split()

    if len(words) < 4:
        return 0.0

    unique_words = len(set(words))
    return 1 - (unique_words / len(words))


def contains_repeated_phrase(text: str) -> bool:
    text = text.lower()

    for phrase in BAD_PHRASES:
        if text.count(phrase) >= 3:
            return True

    return False


def contains_loop(text: str) -> bool:
    words = text.split()

    if len(words) < 6:
        return False

    for i in range(len(words) - 3):
        if (
            words[i]
            == words[i + 1]
            == words[i + 2]
            == words[i + 3]
        ):
            return True

    return False


def is_hallucination(text: str) -> bool:
    if not text or not text.strip():
        return True

    t = text.lower().strip()

    if is_repetition_hallucination(t):
        return True

    if len(t) > 180:
        words = re.findall(r"\b\w+\b", t)
        if len(words) > 20:
            unique_ratio = len(set(words)) / len(words)
            if unique_ratio < 0.45:
                return True

    for phrase in BAD_PHRASES:
        if t.count(phrase) >= 3:
            return True

    words = re.findall(r"\b\w+\b", t)

    if len(words) >= 10:
        counts = Counter(words)
        _, count = counts.most_common(1)[0]

        if count / len(words) > 0.35:
            return True

    return False