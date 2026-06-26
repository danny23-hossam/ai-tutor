import os
import time
import re
import traceback
import json
import random
from openai import OpenAI

# ─────────────────────────── Configuration ───────────────────────────

MODEL_NAME                = "openai/gpt-oss-20b"
MAX_INPUT_TOKENS          = 1500
SAFETY_MARGIN_TOKENS      = 256
MAX_RETRIES               = 2
CHUNK_RESPONSE_MAX_TOKENS = 3200

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

# ─────────────────────────── Prompt Helpers ───────────────────────────

def get_target_count(qty) -> int:
    if isinstance(qty, int) or str(qty).isdigit():
        return int(qty)
    return {"low": 10, "standard": 15, "high": 30}.get(str(qty).lower(), 15)


def get_system_prompt(count: int, diff: str) -> str:
    difficulty = (
        "hard: require inference, comparison, synthesis, and application of core ideas"
        if diff == "hard"
        else "standard: use important concepts, definitions, mechanisms, relationships, and applications"
    )

    return (
        "Generate multiple-choice questions from the provided text.\n"
        f"Difficulty: {difficulty}.\n"
        f"Return exactly {count} questions.\n"
        "Return only valid compact JSON. No markdown, no code fence.\n"
        'Schema: {"questions":[{"id":1,"question":"...","options":['
        '{"key":"a","text":"..."},{"key":"b","text":"..."},'
        '{"key":"c","text":"..."},{"key":"d","text":"..."}],'
        '"answer":"a","explanation_points":['
        '{"key":"a","text":"Correct: ..."},{"key":"b","text":"Incorrect: ..."},'
        '{"key":"c","text":"Incorrect: ..."},{"key":"d","text":"Incorrect: ..."}]}]}\n'
        "Rules: use only the source text; no all/none-of-the-above; plausible distractors; "
        "non-empty strings; answer must be a, b, c, or d; avoid duplicates. "
        "Focus only on the core points of the lecture: main concepts, mechanisms, definitions, relationships, "
        "important examples, causes/effects, comparisons, applications, and takeaways. "
        "Generate related questions that connect ideas across the same topic, not isolated trivia. "
        "Prefer hard, understanding-based questions over recall-only questions. "
        "Ask about why, how, differences, consequences, applications, and common misconceptions when supported by the text. "
        "Avoid minor details unless they are necessary to understand the topic. "
        "Do not ask from lecture intro/admin details such as dates, due dates, deadlines, schedules, instructor names, "
        "course logistics, greetings, announcements, page numbers, references, or file metadata. "
        "If the source text contains numbers, formulas, units, calculations, algorithms, or quantitative relationships, "
        "include suitable numerical/application questions when they can be answered from the source text. "
        "Make every option related to the same context and confusing enough to test understanding. "
        "Distractors must be plausible misconceptions from the lecture context, not obviously unrelated answers. "
        "Do not make the longest or most detailed option consistently correct; keep option lengths balanced. "
        "Vary the correct answer position across a, b, c, and d; do not follow a predictable answer-key pattern."
    )

def get_retry_prompt(count: int) -> str:
    """
    Minimal fallback prompt used when the first attempt returns no JSON at all.
    Strips everything down to reduce confusion.
    """
    return (
        f"Generate {count} MCQs. Output only JSON: "
        "Focus only on core lecture points and related understanding, not isolated trivia or lecture intro/admin details. "
        "Do not ask about dates, due dates, deadlines, schedules, greetings, announcements, page numbers, references, or metadata. "
        "Include numerical/application questions only when supported by the text. "
        "Use plausible context-related distractors. Keep option lengths balanced. Vary correct answer positions. "
        '{"questions":[{"id":1,"question":"...","options":[{"key":"a","text":"..."},'
        '{"key":"b","text":"..."},{"key":"c","text":"..."},{"key":"d","text":"..."}],'
        '"answer":"a","explanation_points":[{"key":"a","text":"Correct: ..."},'
        '{"key":"b","text":"Incorrect: ..."},{"key":"c","text":"Incorrect: ..."},'
        '{"key":"d","text":"Incorrect: ..."}]}]}'
    )

# ─────────────────────────── Token / Chunking ───────────────────────────

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


def chunk_text_by_token_limit(text: str, max_input_tokens: int, safety_margin: int) -> list:
    limit = max(64, max_input_tokens - safety_margin)
    chunks, current = [], ""

    for para in re.split(r"\n{2,}", text):
        para = para.strip()
        if not para:
            continue

        if estimate_tokens(para) > limit:
            for sentence in re.split(r"(?<=[.!?])\s+", para):
                sentence = sentence.strip()
                if not sentence:
                    continue
                candidate = f"{current}\n\n{sentence}".strip() if current else sentence
                if estimate_tokens(candidate) <= limit:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    if estimate_tokens(sentence) > limit:
                        step = limit * 4
                        for i in range(0, len(sentence), step):
                            part = sentence[i:i + step].strip()
                            if part:
                                chunks.append(part)
                        current = ""
                    else:
                        current = sentence
        else:
            candidate = f"{current}\n\n{para}".strip() if current else para
            if estimate_tokens(candidate) <= limit:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = para

    if current:
        chunks.append(current)
    return chunks

# ─────────────────────────── API Call ───────────────────────────

def call_llm(messages: list, max_response_tokens: int) -> str:
    """Call the LLM with exponential backoff. Returns raw response text."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = get_groq_client().chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=0.1,
                max_tokens=max_response_tokens,
            )
            return resp.choices[0].message.content

        except Exception as e:
            err = str(e).lower()
            if any(k in err for k in ("413", "request too large", "request entity too large")):
                raise
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt
            print(f"[LLM] Transient error, retry {attempt + 1}/{MAX_RETRIES} in {wait}s — {e}")
            time.sleep(wait)

    raise RuntimeError("Exhausted all retries.")

# ─────────────────────────── JSON Pipeline ───────────────────────────

_INVALID_BACKSLASH_RE = re.compile(r'(?<!\\)\\(?!["\\/bfnrtu])')


def _repair_backslashes(text: str) -> str:
    return _INVALID_BACKSLASH_RE.sub(r"\\\\", text)


def _extract_complete_questions(text: str) -> dict | None:
    """
    When the JSON is truncated mid-stream, pull out every fully-formed
    question object that appears before the cut-off point.
    Returns a {"questions": [...]} dict, or None if nothing usable found.
    """
    question_blocks = re.findall(
        r'\{\s*"id"\s*:.*?"explanation_points"\s*:\s*\[.*?\]\s*\}',
        text,
        re.DOTALL,
    )
    if not question_blocks:
        return None

    valid = []
    for block in question_blocks:
        try:
            q = json.loads(block)
            valid.append(q)
        except json.JSONDecodeError:
            try:
                q = json.loads(_repair_backslashes(block))
                valid.append(q)
            except json.JSONDecodeError:
                pass  # truly broken block — skip it

    return {"questions": valid} if valid else None


def extract_json_from_response(raw: str) -> dict:
    text = raw.strip()

    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    # ── 1. Direct parse (happy path) ──────────────────────────────────
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # ── 2. Extract first complete { ... } block ───────────────────────
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        print(f"[DEBUG] Model returned no JSON. Raw response:\n---\n{raw}\n---")
        raise ValueError("No JSON object found in model response.")
    extracted = match.group(0)

    try:
        return json.loads(extracted)
    except json.JSONDecodeError:
        pass

    # ── 3. Repair unescaped backslashes ───────────────────────────────
    repaired = _repair_backslashes(extracted)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # ── 4. Truncated response — salvage complete question blocks ──────
    print("[DEBUG] JSON truncated or malformed — attempting partial salvage...")
    salvaged = _extract_complete_questions(repaired)
    if salvaged:
        print(f"[DEBUG] Salvaged {len(salvaged['questions'])} question(s) from truncated response.")
        return salvaged

    print(f"[DEBUG] JSON unparseable. Raw response:\n---\n{raw}\n---")
    raise ValueError("JSON unparseable and no complete questions could be salvaged.")


def _normalize_keyed_items(items, default_keys=("a", "b", "c", "d")) -> list[dict]:
    normalized = []

    if isinstance(items, dict):
        items = [
            {"key": key, "text": value}
            for key, value in items.items()
        ]

    if not isinstance(items, list):
        return normalized

    for idx, item in enumerate(items[:len(default_keys)]):
        fallback_key = default_keys[idx]

        if isinstance(item, dict):
            key = str(item.get("key") or item.get("id") or item.get("label") or fallback_key)
            text = item.get("text") or item.get("value") or item.get("option") or item.get("content")
        else:
            key = fallback_key
            text = item

        normalized.append({
            "key": key.strip().lower()[:1],
            "text": re.sub(r"\s+", " ", str(text or "")).strip(),
        })

    return normalized


def _normalize_answer(answer) -> str:
    answer = str(answer or "").strip().lower()
    if answer in ("a", "b", "c", "d"):
        return answer

    match = re.match(r"^([a-d])[\).:\-\s]", answer)
    if match:
        return match.group(1)

    return answer[:1]


def normalize_questions_json(data: dict) -> dict:
    if not isinstance(data, dict) or "questions" not in data:
        raise ValueError("Response must be a JSON object with a 'questions' key.")
    if not isinstance(data["questions"], list):
        raise ValueError("'questions' must be a list.")

    out = []
    for idx, q in enumerate(data["questions"], start=1):
        if not isinstance(q, dict):
            continue

        options = _normalize_keyed_items(q.get("options") or q.get("choices"))
        explanations = _normalize_keyed_items(
            q.get("explanation_points")
            or q.get("explanations")
            or q.get("rationales")
        )

        out.append({
            "id": idx,
            "question": re.sub(r"\s+", " ", str(q.get("question", "")).strip()),
            "options": options,
            "answer": _normalize_answer(q.get("answer") or q.get("correct_answer")),
            "explanation_points": explanations,
        })
    return {"questions": out}


def validate_question(q: dict, i: int):
    for field in ("id", "question", "options", "answer", "explanation_points"):
        if field not in q:
            raise ValueError(f"Q{i} missing field '{field}'.")
    if not q["question"]:
        raise ValueError(f"Q{i} has empty question text.")
    if not isinstance(q["options"], list) or len(q["options"]) != 4:
        raise ValueError(f"Q{i} must have exactly 4 options (got {len(q.get('options', []))}).")
    if [o["key"] for o in q["options"]] != ["a", "b", "c", "d"]:
        raise ValueError(f"Q{i} option keys must be a, b, c, d in order.")
    for o in q["options"]:
        if not o.get("text"):
            raise ValueError(f"Q{i} has an empty option text.")
    if q["answer"] not in ("a", "b", "c", "d"):
        raise ValueError(f"Q{i} has invalid answer '{q['answer']}'.")
    if not isinstance(q["explanation_points"], list) or len(q["explanation_points"]) != 4:
        raise ValueError(f"Q{i} must have exactly 4 explanation_points.")
    if [e["key"] for e in q["explanation_points"]] != ["a", "b", "c", "d"]:
        raise ValueError(f"Q{i} explanation_point keys must be a, b, c, d in order.")
    for e in q["explanation_points"]:
        if not e.get("text"):
            raise ValueError(f"Q{i} has an empty explanation_point text.")


def shuffle_question_options(q: dict) -> dict:
    pairs = []
    explanations_by_key = {
        e["key"]: e
        for e in q["explanation_points"]
    }

    for option in q["options"]:
        key = option["key"]
        pairs.append({
            "option": option,
            "explanation": explanations_by_key.get(key),
            "is_correct": key == q["answer"],
        })

    random.shuffle(pairs)

    keys = ["a", "b", "c", "d"]
    new_options = []
    new_explanations = []
    new_answer = q["answer"]

    for idx, pair in enumerate(pairs):
        new_key = keys[idx]
        new_options.append({
            "key": new_key,
            "text": pair["option"]["text"],
        })

        explanation = pair["explanation"] or {"text": ""}
        new_explanations.append({
            "key": new_key,
            "text": explanation["text"],
        })

        if pair["is_correct"]:
            new_answer = new_key

    q["options"] = new_options
    q["explanation_points"] = new_explanations
    q["answer"] = new_answer
    return q


def set_question_answer_key(q: dict, target_key: str) -> dict:
    explanations_by_key = {
        e["key"]: e
        for e in q["explanation_points"]
    }
    correct_pair = None
    incorrect_pairs = []

    for option in q["options"]:
        key = option["key"]
        pair = {
            "option": option,
            "explanation": explanations_by_key.get(key),
            "is_correct": key == q["answer"],
        }

        if pair["is_correct"]:
            correct_pair = pair
        else:
            incorrect_pairs.append(pair)

    if correct_pair is None or target_key not in ("a", "b", "c", "d"):
        return q

    random.shuffle(incorrect_pairs)

    keys = ["a", "b", "c", "d"]
    arranged = []
    incorrect_idx = 0

    for key in keys:
        if key == target_key:
            arranged.append(correct_pair)
        else:
            arranged.append(incorrect_pairs[incorrect_idx])
            incorrect_idx += 1

    new_options = []
    new_explanations = []

    for key, pair in zip(keys, arranged):
        new_options.append({
            "key": key,
            "text": pair["option"]["text"],
        })

        explanation = pair["explanation"] or {"text": ""}
        new_explanations.append({
            "key": key,
            "text": explanation["text"],
        })

    q["options"] = new_options
    q["explanation_points"] = new_explanations
    q["answer"] = target_key
    return q


def balance_answer_positions(questions: list[dict]) -> list[dict]:
    keys = ["a", "b", "c", "d"]
    target_keys = [keys[idx % len(keys)] for idx in range(len(questions))]
    random.shuffle(target_keys)

    balanced = []
    for idx, q in enumerate(questions):
        target_key = target_keys[idx]
        q = set_question_answer_key(q, target_key)
        validate_question(q, idx + 1)
        balanced.append(q)

    return balanced


def parse_and_collect_valid_questions(raw: str) -> list:
    """Parse a chunk response and return only structurally valid questions."""
    data = extract_json_from_response(raw)
    data = normalize_questions_json(data)

    valid = []
    for i, q in enumerate(data["questions"], start=1):
        try:
            validate_question(q, i)
            q = shuffle_question_options(q)
            validate_question(q, i)
            valid.append(q)
        except ValueError as e:
            print(f"[Validation] Skipping malformed question: {e}")
    return valid

# ─────────────────────────── Chunk Processing with Retry ───────────────────────────

def process_chunk(chunk: str, count: int, diff: str, max_resp_tokens: int, chunk_label: str) -> list:
    """
    Attempt to generate `count` questions from `chunk`.
    - First attempt: full detailed prompt.
    - If no JSON returned: retry once with a minimal fallback prompt.
    Returns a list of valid question dicts (may be fewer than count).
    """
    # ── Attempt 1: full prompt ──────────────────────────────────────────
    messages = [
        {"role": "system", "content": get_system_prompt(count, diff)},
        {"role": "user",   "content": f"Text:\n\n{chunk}"},
    ]
    try:
        raw = call_llm(messages, max_resp_tokens)
        valid_qs = parse_and_collect_valid_questions(raw)
        print(f"[{chunk_label}] attempt 1 → accepted {len(valid_qs)}/{count} questions")
        if valid_qs:
            return valid_qs
    except ValueError as e:
        print(f"[{chunk_label}] attempt 1 parse error: {e}")
    except Exception as e:
        print(f"[{chunk_label}] attempt 1 LLM error: {e}")
        traceback.print_exc()
        return []   # hard LLM failure — don't bother retrying

    # ── Attempt 2: minimal fallback prompt ─────────────────────────────
    print(f"[{chunk_label}] retrying with minimal prompt...")
    fallback_messages = [
        {"role": "system", "content": get_retry_prompt(count)},
        {"role": "user",   "content": chunk},
    ]
    try:
        raw = call_llm(fallback_messages, max_resp_tokens)
        valid_qs = parse_and_collect_valid_questions(raw)
        print(f"[{chunk_label}] attempt 2 → accepted {len(valid_qs)}/{count} questions")
        return valid_qs
    except Exception as e:
        print(f"[{chunk_label}] attempt 2 also failed: {e}")
        return []

# ─────────────────────────── Main Entry Point ───────────────────────────

def generate_questions(long_text: str, qty: str = "standard", diff: str = "standard") -> dict:
    """
    Generate frontend-ready MCQ JSON from long_text.
    Returns: {"questions": [...]}  — never nested.
    """
    if not long_text.strip():
        raise RuntimeError("Input text is empty.")

    target_count = get_target_count(qty)
    chunks = chunk_text_by_token_limit(long_text, MAX_INPUT_TOKENS, SAFETY_MARGIN_TOKENS)

    if not chunks:
        raise RuntimeError("No valid text chunks produced.")

    base_per_chunk, remainder = divmod(target_count, len(chunks))
    collected = []

    for idx, chunk in enumerate(chunks, start=1):
        chunk_q_count = base_per_chunk + (1 if idx <= remainder else 0)
        if chunk_q_count <= 0:
            continue

        max_resp_tokens = min(CHUNK_RESPONSE_MAX_TOKENS, 430 * chunk_q_count + 220)
        label = f"Chunk {idx}/{len(chunks)}"

        print(
            f"[{label}] questions={chunk_q_count} | "
            f"tokens≈{estimate_tokens(chunk)} | "
            f"max_resp={max_resp_tokens}"
        )

        valid_qs = process_chunk(chunk, chunk_q_count, diff, max_resp_tokens, label)
        collected.extend(valid_qs)

    if not collected:
        raise RuntimeError("All chunks failed — no questions generated.")

    # Trim if we got more than requested
    if len(collected) > target_count:
        collected = collected[:target_count]

    collected = balance_answer_positions(collected)

    # Re-number IDs globally
    for i, q in enumerate(collected, start=1):
        q["id"] = i

    print(f"[Done] Returning {len(collected)}/{target_count} questions.")
    return {"questions": collected}
