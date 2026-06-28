import json
import os
import threading
from pathlib import Path

from app.config import settings


class ConversationMemory:
    def __init__(self):
        self._lock = threading.Lock()
        self._path = Path(settings.data_dir) / "rag_memory.json"
        self._data: dict[str, list[dict]] = {}
        self._load()

    @staticmethod
    def key(user_id: str, lesson_id: str, document_id: str) -> str:
        return f"{user_id}::{lesson_id}::{document_id}"

    def get(self, user_id: str, lesson_id: str, document_id: str) -> list[dict]:
        key = self.key(user_id, lesson_id, document_id)
        with self._lock:
            return list(self._data.get(key, []))

    def get_recent(self, user_id: str, lesson_id: str, document_id: str) -> list[dict]:
        turns = self.get(user_id, lesson_id, document_id)
        return turns[-settings.memory_max_turns :]

    def append_turns(
        self,
        user_id: str,
        lesson_id: str,
        document_id: str,
        question: str,
        answer: str,
    ) -> list[dict]:
        key = self.key(user_id, lesson_id, document_id)
        with self._lock:
            turns = self._data.setdefault(key, [])
            turns.extend(
                [
                    {"role": "user", "content": question},
                    {"role": "assistant", "content": answer},
                ]
            )
            self._save()
            return list(self._data[key])

    def clear(self, user_id: str, lesson_id: str, document_id: str) -> None:
        key = self.key(user_id, lesson_id, document_id)
        with self._lock:
            self._data.pop(key, None)
            self._save()

    def _load(self) -> None:
        try:
            if self._path.exists():
                self._data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._data = {}

    def _save(self) -> None:
        os.makedirs(self._path.parent, exist_ok=True)
        temp_path = self._path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(self._path)


memory = ConversationMemory()
