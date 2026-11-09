def is_confident(
    language_probability: float,
    speech_duration: float,
) -> bool:

    if speech_duration <= 0:
        return False

    if language_probability < 0.50:
        return False

    return True