import re
from collections import Counter


COMMON_LOOP_PHRASES = [
    "i'm sorry",
    "i am sorry",
    "thank you",
    "thank you very much",
    "a little bit",
    "you're not going to",
    "you are not going to",
    "i'm going to",
    "i am going to",
    "new new new",
    "it's a lot of work",
    "it is a lot of work",
]


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s']", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def has_repeated_phrase(text: str) -> bool:
    t = normalize_text(text)

    for phrase in COMMON_LOOP_PHRASES:
        if t.count(phrase) >= 3:
            return True

    words = t.split()

    if len(words) < 6:
        return False

    for n in range(1, 6):
        chunks = [
            " ".join(words[i:i + n])
            for i in range(len(words) - n + 1)
        ]

        counts = Counter(chunks)

        for phrase, count in counts.items():
            if count >= 4 and len(phrase) > 1:
                return True

    return False


def has_repeated_words(text: str) -> bool:
    words = normalize_text(text).split()

    if len(words) < 8:
        return False

    counts = Counter(words)
    most_common_word, count = counts.most_common(1)[0]

    if count / len(words) >= 0.35:
        return True

    repeated_in_row = 1

    for i in range(1, len(words)):
        if words[i] == words[i - 1]:
            repeated_in_row += 1
            if repeated_in_row >= 4:
                return True
        else:
            repeated_in_row = 1

    return False


def is_repetition_hallucination(text: str) -> bool:
    if not text or not text.strip():
        return False

    text = text.strip()

    if len(text) > 250 and "," in text:
        return True

    if has_repeated_phrase(text):
        return True

    if has_repeated_words(text):
        return True

    return False