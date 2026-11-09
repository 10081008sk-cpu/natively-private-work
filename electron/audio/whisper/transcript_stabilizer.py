from collections import deque

class TranscriptStabilizer:

    def __init__(self, max_history=5):
        self.history = deque(maxlen=max_history)

    def process(self, text: str) -> str:

        if not text:
            return ""

        self.history.append(text)

        if len(self.history) == 1:
            return text

        previous = self.history[-2]

        if text.startswith(previous):
            return text

        return text