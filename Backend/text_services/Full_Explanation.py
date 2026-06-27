import dotenv
import time
import re
import traceback

# ------------------------------- Configuration -------------------------------
MODEL_NAME = "openai/gpt-oss-20b"

MAX_INPUT_TOKENS = 1200
SAFETY_MARGIN_TOKENS = 256
MAX_RETRIES = 4
CHUNK_RESPONSE_MAX_TOKENS = 1800
GROQ_TPM_WAIT_SECONDS = 65

TRIGGER_CHUNK_COUNT = None
TRIGGER_CHUNK_INDEX = None

PARAGRAPHS_PER_CHUNK = 8
ENFORCE_TOKEN_LIMIT_ON_GROUP = True

API_KEY = dotenv.get_key(".env", "GROQ_API_KEY")

from openai import OpenAI

groq_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=API_KEY
)


# ------------------------------- System prompts -------------------------------

SYSTEM_PROMPT = (
    "You are an educational content explainer. "
    "Your job is to turn the input text into a clear, focused explanation that will later be converted into a TTS narration script. "

    "OUTPUT GOAL: "
    "Produce clean explanatory text that can be passed as long_text into a TTS-script-generation endpoint. "

    "CONTENT RULES: "
    "- Focus only on the important ideas, mechanisms, definitions, architecture, equations, results, and takeaways. "
    "- Do not include author names, emails, affiliations, footnotes, references, citations, or bibliography details unless they are essential to understanding the concept. "
    "- Do not list paper metadata. "
    "- Do not over-explain historical background unless it directly helps explain the main idea. "
    "- Explain the content in the same logical order as the input, but skip unnecessary administrative or publication details. "
    "- For equations, do not output raw LaTeX only. Explain what the equation means in plain language. "
    "- Keep technical terms such as Transformer, attention, softmax, BLEU, encoder, decoder, RNN, CNN, GPU, Adam, ReLU in English when appropriate. "
    "- If the input contains many details, prioritize the details that help a student understand the topic. "

    "STYLE RULES: "
    "- Write in clear simple English. "
    "- Do not use markdown headings like ## or ###. "
    "- Do not use tables. "
    "- Do not use bullet-heavy formatting. "
    "- Do not use labels like Step 1, Step 2, Step 3. "
    "- Write as smooth paragraphs that can be later transformed into speech. "
    "- Use short paragraphs. "
    "- Add [pause] between major ideas. "
    "- Add [transition] when moving to a new major section. "

    "FINAL OUTPUT RULES: "
    "- Return only the explanation text. "
    "- Do not return JSON. "
    "- Do not wrap the answer in quotes. "
    "- Do not include markdown fences. "
)


SYSTEM_PROMPT_ALT = (
    "You are an educational content explainer. "
    "Your job is to turn the input text into a clear, focused explanation that will later be converted into a TTS narration script. "

    "OUTPUT GOAL: "
    "Produce clean explanatory text that can be passed as long_text into a TTS-script-generation endpoint. "

    "CONTENT RULES: "
    "- Focus only on the important ideas, mechanisms, definitions, architecture, equations, results, and takeaways. "
    "- Do not include author names, emails, affiliations, footnotes, references, citations, or bibliography details unless they are essential to understanding the concept. "
    "- Do not list paper metadata. "
    "- Do not over-explain historical background unless it directly helps explain the main idea. "
    "- Explain the content in the same logical order as the input, but skip unnecessary administrative or publication details. "
    "- For equations, do not output raw LaTeX only. Explain what the equation means in plain language. "
    "- Keep technical terms such as Transformer, attention, softmax, BLEU, encoder, decoder, RNN, CNN, GPU, Adam, ReLU in English when appropriate. "
    "- If the input contains many details, prioritize the details that help a student understand the topic. "

    "STYLE RULES: "
    "- Write in clear simple English. "
    "- Do not use markdown headings like ## or ###. "
    "- Do not use tables. "
    "- Do not use bullet-heavy formatting. "
    "- Do not use labels like Step 1, Step 2, Step 3. "
    "- Write as smooth paragraphs that can be later transformed into speech. "
    "- Use short paragraphs. "
    "- Add [pause] between major ideas. "
    "- Add [transition] when moving to a new major section. "

    "ENDING RULES: "
    "- End with a concise final recap of the most important ideas only. "
    "- Do not add questions to the user. "
    "- Do not add unnecessary limitations or open research questions unless the input directly discusses them. "

    "FINAL OUTPUT RULES: "
    "- Return only the explanation text. "
    "- Do not return JSON. "
    "- Do not wrap the answer in quotes. "
    "- Do not include markdown fences. "
)


# ------------------------------- Token estimation -------------------------------

def estimate_tokens(text: str) -> int:
    """
    Try to use tiktoken for accurate token counts.
    Otherwise fallback to heuristic: 1 token ≈ 4 characters.
    """
    try:
        import tiktoken

        try:
            enc = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")

        return len(enc.encode(text))

    except Exception:
        return max(1, int(len(text) / 4))


# ------------------------------- Chunking logic -------------------------------

def chunk_text_by_token_limit(
    text: str,
    max_input_tokens: int,
    safety_margin_tokens: int = 256
):
    """
    Split text into chunks whose estimated token count <= max_input_tokens - safety_margin_tokens.
    Prefer paragraph boundaries. Fall back to sentence or character splits if needed.
    """

    max_tokens_per_chunk = max(64, max_input_tokens - safety_margin_tokens)

    paragraphs = re.split(r"\n{2,}", text)
    chunks = []
    current = ""

    for p in paragraphs:
        p = p.strip()

        if not p:
            continue

        if estimate_tokens(p) > max_tokens_per_chunk:
            sentences = re.split(r"(?<=[.!?])\s+", p)

            for s in sentences:
                if not s.strip():
                    continue

                candidate = (current + "\n\n" + s).strip() if current else s

                if estimate_tokens(candidate) <= max_tokens_per_chunk:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)

                    if estimate_tokens(s) > max_tokens_per_chunk:
                        approx_chars = max_tokens_per_chunk * 4

                        for i in range(0, len(s), approx_chars):
                            part = s[i:i + approx_chars].strip()
                            if part:
                                chunks.append(part)

                        current = ""
                    else:
                        current = s
        else:
            candidate = (current + "\n\n" + p).strip() if current else p

            if estimate_tokens(candidate) <= max_tokens_per_chunk:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = p

    if current:
        chunks.append(current)

    return chunks


def chunk_by_paragraph_groups(
    text: str,
    paragraphs_per_chunk: int = PARAGRAPHS_PER_CHUNK,
    enforce_token_limit: bool = False,
    max_input_tokens: int = None
):
    """
    Split text into chunks where each chunk contains paragraphs_per_chunk paragraphs.
    If enforce_token_limit=True and a group exceeds max_input_tokens, fall back to token-aware chunking.
    """

    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    if not paras:
        return []

    groups = []

    for i in range(0, len(paras), paragraphs_per_chunk):
        group_paras = paras[i:i + paragraphs_per_chunk]
        group_text = "\n\n".join(group_paras)

        if enforce_token_limit and max_input_tokens is not None:
            est = estimate_tokens(group_text)

            if est > max_input_tokens:
                sub_chunks = chunk_text_by_token_limit(
                    group_text,
                    max_input_tokens=max_input_tokens,
                    safety_margin_tokens=SAFETY_MARGIN_TOKENS
                )
                groups.extend(sub_chunks)
                continue

        groups.append(group_text)

    return groups


# ------------------------------- API call with backoff -------------------------------

def call_chat_with_backoff(
    client,
    model,
    messages,
    max_retries: int = 4,
    base_wait: float = 1.0,
    max_response_tokens=None
):
    """
    Call client.chat.completions.create with simple exponential backoff.
    """

    for attempt in range(max_retries):
        try:
            kwargs = {}

            if max_response_tokens is not None:
                kwargs["max_tokens"] = max_response_tokens

            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )

            return resp

        except Exception as e:
            txt = str(e).lower()

            if "tokens per minute" in txt or "rate_limit_exceeded" in txt:
                if attempt == max_retries - 1:
                    raise
                wait = GROQ_TPM_WAIT_SECONDS
                print(f"Groq TPM limit reached, retrying in {wait}s...")
                time.sleep(wait)
                continue

            if "413" in txt or "request too large" in txt or "request entity too large" in txt:
                raise

            if attempt == max_retries - 1:
                raise

            wait = base_wait * (2 ** attempt)
            print(
                f"Transient error, retrying in {wait}s... "
                f"(attempt {attempt + 1}/{max_retries})"
            )
            time.sleep(wait)

    raise RuntimeError("Exhausted retries")


# ------------------------------- Response extraction -------------------------------

def extract_text_from_response(resp):
    """
    Robust extraction across SDK response shapes.
    """

    try:
        if hasattr(resp, "choices"):
            choice = resp.choices[0]

            if hasattr(choice, "message") and hasattr(choice.message, "content"):
                return choice.message.content

            if isinstance(choice, dict):
                return choice.get("message", {}).get("content") or choice.get("text")

        if isinstance(resp, dict):
            return (
                resp.get("choices", [{}])[0].get("message", {}).get("content")
                or resp.get("choices", [{}])[0].get("text")
            )

    except Exception:
        pass

    return str(resp)


# ------------------------------- Final TTS-script cleaning -------------------------------

def clean_explanation_for_tts_script_endpoint(text: str) -> str:
    """
    Clean explanation output so it is suitable as long_text
    for the tts_scripts endpoint.

    This does not make JSON.
    It only returns clean plain text.
    """

    if not text:
        return ""

    text = text.strip()

    # Remove markdown headings
    text = re.sub(r"#{1,6}\s*", "", text)

    # Remove markdown bold/italic markers
    text = text.replace("**", "")
    text = text.replace("*", "")

    # Remove markdown bullets at line starts
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.MULTILINE)

    # Remove emails
    text = re.sub(r"\S+@\S+", " ", text)

    # Remove citation/reference markers like [1], [38]
    # Keep [pause] and [transition]
    text = re.sub(
        r"\[(?!pause\]|transition\])\d+\]",
        " ",
        text,
        flags=re.IGNORECASE
    )

    # Remove bibliography-like sections if generated
    text = re.sub(r"\bReferences\b\s*:?.*", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bBibliography\b\s*:?.*", " ", text, flags=re.IGNORECASE)

    # Normalize pause markers
    text = re.sub(r"\[pause\]", " [pause] ", text, flags=re.IGNORECASE)
    text = re.sub(r"\[transition\]", " [transition] ", text, flags=re.IGNORECASE)

    # Remove excessive newlines
    text = text.replace("\r", " ")
    text = text.replace("\n", " ")

    # Normalize spaces
    text = re.sub(r"\s+", " ", text)

    # Restore markers exactly
    text = text.replace("[ pause ]", "[pause]")
    text = text.replace("[ transition ]", "[transition]")

    return text.strip()


# ------------------------------- Main processing -------------------------------

def full_explanation(LONG_TEXT: str):
    """
    Generate a focused, TTS-script-friendly explanation from long input text.
    Output is clean plain text suitable as long_text for the tts_scripts endpoint.
    """

    if not LONG_TEXT.strip():
        raise RuntimeError(
            "LONG_TEXT is empty. Paste your text into the LONG_TEXT variable in the script."
        )

    chunks = chunk_by_paragraph_groups(
        LONG_TEXT,
        paragraphs_per_chunk=PARAGRAPHS_PER_CHUNK,
        enforce_token_limit=ENFORCE_TOKEN_LIMIT_ON_GROUP,
        max_input_tokens=MAX_INPUT_TOKENS if ENFORCE_TOKEN_LIMIT_ON_GROUP else None
    )

    num_chunks = len(chunks)

    # Use alternate prompt for the last chunk so the ending is clean
    trigger_chunk_index = num_chunks

    use_alt_globally = False

    if TRIGGER_CHUNK_COUNT is not None and num_chunks == TRIGGER_CHUNK_COUNT:
        use_alt_globally = True

    all_parts = []
    per_chunk_word_counts = []

    for idx, chunk in enumerate(chunks, start=1):
        est_tokens = estimate_tokens(chunk)

        if use_alt_globally:
            system_for_this_chunk = SYSTEM_PROMPT_ALT
        else:
            if trigger_chunk_index is not None and idx == trigger_chunk_index:
                system_for_this_chunk = SYSTEM_PROMPT_ALT
            else:
                system_for_this_chunk = SYSTEM_PROMPT

        messages = [
            {"role": "system", "content": system_for_this_chunk},
            {"role": "user", "content": chunk}
        ]

        try:
            resp = call_chat_with_backoff(
                groq_client,
                model=MODEL_NAME,
                messages=messages,
                max_retries=MAX_RETRIES,
                base_wait=1.0,
                max_response_tokens=CHUNK_RESPONSE_MAX_TOKENS
            )

        except Exception as e:
            print(f"Error while processing chunk {idx}: {e}", flush=True)
            print(traceback.format_exc(), flush=True)
            raise

        explanation = extract_text_from_response(resp)

        if explanation is None:
            raise RuntimeError(f"Empty response for chunk {idx}")

        explanation = explanation.strip()

        words = re.findall(r"\b\w+\b", explanation)
        wc = len(words)
        per_chunk_word_counts.append(wc)

        all_parts.append({
            "chunk_index": idx,
            "chunk_estimated_tokens": est_tokens,
            "chunk_chars": len(chunk),
            "response_text": explanation,
            "response_word_count": wc,
            "used_alt_prompt": system_for_this_chunk is SYSTEM_PROMPT_ALT
        })

    combined_sections = []

    for p in all_parts:
        combined_sections.append(p["response_text"])

    combined_text = " [transition] ".join(combined_sections)
    combined_text = clean_explanation_for_tts_script_endpoint(combined_text)

    return combined_text
