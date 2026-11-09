import re

DEVANAGARI_RE = re.compile(r'[\u0900-\u097F]')

def contains_devanagari(text: str) -> bool:
    return bool(DEVANAGARI_RE.search(text))

def validate_language(
    text: str,
    language: str,
) -> bool:

    if not text:
        return False

    if language == "hi":
        return True

    if language == "en":
        return True

    return True