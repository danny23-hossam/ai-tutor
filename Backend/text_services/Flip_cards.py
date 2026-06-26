import json
import os
import re
import time

from openai import OpenAI


MODEL_NAME = "openai/gpt-oss-20b"

MAX_INPUT_TOKENS = 1500
SAFETY_MARGIN_TOKENS = 256
MAX_RETRIES = 1
CHUNK_RESPONSE_MAX_TOKENS = 1600

groq_client = None


def get_groq_client():
    global groq_client

    if groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")

        groq_client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=api_key,
        )

    return groq_client


def get_target_count(qty) -> int:
    if isinstance(qty, int) or str(qty).isdigit():
        return int(qty)

    return {
        "low": 10,
        "standard": 15,
        "high": 30,
    }.get(str(qty).lower(), 15)


def get_system_prompt(count: int, diff: str = "standard") -> str:
    difficulty = (
        "hard: require inference, comparison, synthesis, and application of core ideas"
        if diff == "hard"
        else "standard: prefer important concepts, definitions, mechanisms, and relationships"
    )

    return (
        "Generate study flashcards from the provided text.\n"
        f"Difficulty: {difficulty}.\n"
        f"Return exactly {count} flashcards.\n"
        "Return only valid compact JSON, no markdown, no code fence.\n"
        'Schema: {"flashcards":[{"question":"...","answer":"..."}]}\n'
        "Rules: question and answer must be non-empty strings; answer should be concise; "
        "do not invent facts; avoid duplicates. "
        "Focus only on the core points of the lecture: main concepts, mechanisms, definitions, relationships, "
        "important examples, causes/effects, comparisons, and takeaways. "
        "Generate related flashcards that connect ideas across the same topic, not isolated trivia. "
        "Prefer hard, understanding-based cards over recall-only cards. "
        "Ask about why, how, differences, consequences, applications, and common misconceptions when supported by the text. "
        "Do not create cards from lecture intro/admin details such as dates, due dates, deadlines, schedules, instructor names, "
        "course logistics, greetings, announcements, page numbers, references, or file metadata. "
        "Avoid minor facts unless they are essential to understanding the core topic."
    )


def estimate_tokens(text: str) -> int:
    try:
        import tiktoken

        try:
            enc = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")

        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


def chunk_text_by_token_limit(text: str, max_input_tokens: int, safety_margin: int) -> list[str]:
    limit = max(64, max_input_tokens - safety_margin)
    chunks = []
    current = ""

    for para in re.split(r"\n{2,}", text):
        para = para.strip()
        if not para:
            continue

        if estimate_tokens(para) > limit:
            sentences = re.split(r"(?<=[.!?])\s+", para)
        else:
            sentences = [para]

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            candidate = f"{current}\n\n{sentence}".strip() if current else sentence
            if estimate_tokens(candidate) <= limit:
                current = candidate
                continue

            if current:
                chunks.append(current)

            if estimate_tokens(sentence) > limit:
                step = limit * 4
                chunks.extend(
                    sentence[i:i + step].strip()
                    for i in range(0, len(sentence), step)
                    if sentence[i:i + step].strip()
                )
                current = ""
            else:
                current = sentence

    if current:
        chunks.append(current)

    return chunks


def call_llm(messages: list, max_response_tokens: int) -> str:
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            response = get_groq_client().chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=0.1,
                max_tokens=max_response_tokens,
            )
            content = response.choices[0].message.content
            if not content or not content.strip():
                raise ValueError("Empty response content from model.")
            return content.strip()
        except Exception as e:
            last_error = e
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt
            print(f"[LLM] transient error, retry {attempt + 1}/{MAX_RETRIES} in {wait}s - {e}")
            time.sleep(wait)

    raise RuntimeError(f"Exhausted retries. Last error: {last_error}")


def extract_json(raw: str) -> dict:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in model response.")
        return json.loads(match.group(0))


def normalize_flashcard(card: dict) -> dict | None:
    question = card.get("question") or card.get("front") or card.get("term")
    answer = card.get("answer") or card.get("back") or card.get("definition")

    question = str(question or "").strip()
    answer = str(answer or "").strip()

    if not question or not answer:
        return None

    return {
        "question": re.sub(r"\s+", " ", question),
        "answer": re.sub(r"\s+", " ", answer),
    }


def parse_flashcards(raw: str, expected_count: int) -> list[dict]:
    data = extract_json(raw)
    cards = data.get("flashcards", [])

    if not isinstance(cards, list):
        raise ValueError("'flashcards' must be a list.")

    parsed = []
    for card in cards:
        if not isinstance(card, dict):
            continue

        normalized = normalize_flashcard(card)
        if normalized:
            parsed.append(normalized)

        if len(parsed) >= expected_count:
            break

    return parsed


def remove_duplicate_flashcards(cards: list[dict]) -> list[dict]:
    seen = set()
    unique = []

    for card in cards:
        key = card["question"].lower()
        key = re.sub(r"\s+", " ", key).strip()

        if key in seen:
            continue

        seen.add(key)
        unique.append(card)

    return unique


def process_chunk(chunk: str, count: int, diff: str, max_resp_tokens: int, chunk_label: str) -> list[dict]:
    messages = [
        {"role": "system", "content": get_system_prompt(count, diff)},
        {"role": "user", "content": chunk},
    ]

    try:
        raw = call_llm(messages, max_resp_tokens)
        cards = parse_flashcards(raw, count)
        print(f"[{chunk_label}] accepted {len(cards)}/{count} flashcards")
        return cards[:count]
    except Exception as e:
        print(f"[{chunk_label}] failed: {e}")
        return []


def generate_flip_cards(long_text: str, qty: str = "standard", diff: str = "standard") -> dict:
    if not long_text or not long_text.strip():
        raise RuntimeError("Input text is empty.")

    target_count = get_target_count(qty)
    chunks = chunk_text_by_token_limit(
        long_text,
        MAX_INPUT_TOKENS,
        SAFETY_MARGIN_TOKENS,
    )

    if not chunks:
        raise RuntimeError("No valid text chunks produced.")

    base_per_chunk, remainder = divmod(target_count, len(chunks))
    collected = []

    for idx, chunk in enumerate(chunks, start=1):
        chunk_card_count = base_per_chunk + (1 if idx <= remainder else 0)
        if chunk_card_count <= 0:
            continue

        max_resp_tokens = min(CHUNK_RESPONSE_MAX_TOKENS, 170 * chunk_card_count + 120)
        label = f"Chunk {idx}/{len(chunks)}"

        print(
            f"[{label}] flashcards={chunk_card_count} | "
            f"tokens~{estimate_tokens(chunk)} | "
            f"max_resp={max_resp_tokens}"
        )

        collected.extend(
            process_chunk(
                chunk=chunk,
                count=chunk_card_count,
                diff=diff,
                max_resp_tokens=max_resp_tokens,
                chunk_label=label,
            )
        )
        collected = remove_duplicate_flashcards(collected)

    if not collected:
        raise RuntimeError("All chunks failed - no flashcards generated.")

    collected = collected[:target_count]
    print(f"[Done] Returning {len(collected)}/{target_count} flashcards.")

    return {"flashcards": collected}
