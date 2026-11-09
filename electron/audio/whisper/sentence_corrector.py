COMMON_FIXES = {
    "im": "I'm",
    "dont": "don't",
    "cant": "can't",
    "wont": "won't",
    "ive": "I've",
    "id": "I'd",
}

def correct_text(text: str) -> str:

    words = text.split()

    corrected = []

    for word in words:
        fixed = COMMON_FIXES.get(
            word.lower(),
            word
        )

        corrected.append(fixed)

    return " ".join(corrected)