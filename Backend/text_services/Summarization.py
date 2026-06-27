import dotenv
import time
import re
# ------------------------------- Configuration -------------------------------
MODEL_NAME = "openai/gpt-oss-20b"
# Safe defaults: adjust if you know your org/model can accept more.
MAX_INPUT_TOKENS = 1200  # token budget for the input chunk (approximate)
SAFETY_MARGIN_TOKENS = 256  # reserved tokens for system/instruction/response overhead
MAX_RETRIES = 4  # API call retry attempts for transient errors
# max tokens for model to produce per chunk (if your client supports this param)
CHUNK_RESPONSE_MAX_TOKENS = 1800
GROQ_TPM_WAIT_SECONDS = 65
API_KEY = dotenv.get_key(".env", "GROQ_API_KEY")
# Import client class matching your earlier code
# Make sure you installed `openai` package: pip install openai
from openai import OpenAI
groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=API_KEY)

# ------------------------------- System prompt -------------------------------
SYSTEM_PROMPT = r"""
You are a professional lecture summarizer. Given the input lecture text, produce a clear, ordered, abstractive lecture summary in valid HTML.

CONTENT RULES:
- Explain the lecture in the same logical order as the input.
- Preserve the educational lecture flow: title, introduction, main sections, equations, problems, solutions, and key takeaways.
- Focus on explaining what the lecture is teaching, not just listing headings.
- Keep the summary concise but informative.
- Preserve important definitions, equations, numeric facts, technical facts, temporal facts that are part of the topic, and relationships.
- For every important equation, include a short explanation of what it represents.
- Add comparisons only when they clarify the lecture content, for example comparing SNE vs t-SNE or normal distribution vs Student-t distribution.
- Highlight main ideas, key terms, and important takeaways using <strong>.
- Do not hallucinate facts that are not supported by the input.
- Omit trivial examples unless they help explain the main concept.

NOISE REMOVAL RULES:
- Remove all administrative, decorative, repeated, or non-educational text.
- Do NOT include lecturer names, instructor names, teaching assistant names, student names, university names, college names, department names, course codes, course titles used only as metadata, semester names, lecture dates, slide dates, due dates, submission deadlines, assignment deadlines, exam dates, office hours, contact information, emails, phone numbers, website links, classroom locations, announcements, copyright notices, logos, headers, footers, page numbers, slide numbers, or repeated template text.
- Do NOT treat administrative dates or deadlines as important temporal facts.
- Only preserve dates, names, or institutions if they are directly part of the academic concept being explained, such as a historical event, named theorem, named algorithm, named dataset, or named method.
- If a line looks like slide metadata, a title-page detail, a footer, or an announcement, ignore it.
- The summary should contain only study-relevant content that helps understand the lecture topic.

HTML OUTPUT RULES:
1. Return ONLY the HTML string. Do not return markdown, code fences, JSON, or explanations.
2. The response MUST be valid HTML.
3. Wrap the entire output in exactly one root container: <div class='lecture-summary'> ... </div>.
4. Use <h2> for the main lecture title.
5. Use <h3> for major lecture sections.
6. Use <p> for explanations and short transitions.
7. Use <strong> only for key terms, formula names, and main points.
8. Use <ul><li>...</li></ul> for steps, comparisons, problems/solutions, and final takeaways.
9. Do NOT include inline styles.
10. Do NOT include <html>, <body>, <head>, <style>, script tags, CSS blocks, or JavaScript.
11. NEVER include newline characters in the generated HTML output. Use HTML tags only for structure.

EQUATION RULES:
12. For every important equation, use this exact format: <div class='equation'>\[ equation_here \]</div>.
13. Equations MUST be written in valid LaTeX inside \[ ... \].
14. Do NOT write important equations as plain text.
15. Use proper LaTeX notation such as \frac{}, \sum, \exp, \log, \lVert \rVert, \sigma_i, \mathcal{L}, \operatorname{KL}, and \partial when needed.
16. Do NOT place equations inside <p> tags.
17. Briefly explain each equation before or after the equation block.

COMPLETENESS RULES:
18. Every opened tag must be properly closed.
19. The final section MUST be exactly: <h3>Key Takeaways</h3> followed by <ul>...</ul>.
20. The entire output MUST end exactly with </ul></div>.
"""

SYSTEM_PROMPT_ALT = SYSTEM_PROMPT

# ------------------------------- Main processing -------------------------------
TRIGGER_CHUNK_COUNT = None
TRIGGER_CHUNK_INDEX = None

PARAGRAPHS_PER_CHUNK = 8
ENFORCE_TOKEN_LIMIT_ON_GROUP = True
# ------------------------------- Token estimation -------------------------------
def estimate_tokens(text: str) -> int:
    """
    Try to use tiktoken for accurate token counts; otherwise fallback to heuristic:
    ~1 token ≈ 4 characters.
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
def chunk_text_by_token_limit(text: str, max_input_tokens: int, safety_margin_tokens: int=256):
    """
    Split text into chunks whose estimated token count <= (max_input_tokens - safety_margin_tokens).
    Prefer paragraph boundaries; fall back to sentences or character-splits if paragraph is too large.
    """
    max_tokens_per_chunk = max(64, max_input_tokens - safety_margin_tokens)
    paragraphs = re.split(r'\n{2,}', text)
    chunks = []
    current = ""
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if estimate_tokens(p) > max_tokens_per_chunk:
            # paragraph is too large: split by sentence-like boundaries
            sentences = re.split(r'(?<=[.!?])\s+', p)
            for s in sentences:
                if not s.strip():
                    continue
                candidate = (current + "\n\n" + s).strip() if current else s
                if estimate_tokens(candidate) <= max_tokens_per_chunk:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    # if sentence still too large, split by chars
                    if estimate_tokens(s) > max_tokens_per_chunk:
                        approx_chars = max_tokens_per_chunk * 4
                        for i in range(0, len(s), approx_chars):
                            part = s[i: i + approx_chars].strip()
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


# ------------------------------- API call with backoff -------------------------------
def call_chat_with_backoff(client, model, messages, max_retries=4, base_wait=1.0, max_response_tokens=None):
    """
    Call client.chat.completions.create with simple exponential backoff for transient errors.
    """
    for attempt in range(max_retries):
        try:
            kwargs = {}
            if max_response_tokens is not None:
                kwargs["max_tokens"] = max_response_tokens
            resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
            return resp
        except Exception as e:
            txt = str(e).lower()
            if "tokens per minute" in txt or "rate_limit_exceeded" in txt:
                if attempt == max_retries - 1:
                    raise
                time.sleep(GROQ_TPM_WAIT_SECONDS)
                continue
            # Non-retriable errors: request too large -> raise so upstream can handle chunking
            if "413" in txt or "request too large" in txt or "request entity too large" in txt:
                raise
            # Last attempt -> re-raise
            if attempt == max_retries - 1:
                raise
            wait = base_wait * (2 ** attempt)
            time.sleep(wait)
    raise RuntimeError("Exhausted retries")


# ------------------------------- Helper for extracting content -------------------------------
def extract_text_from_response(resp):
    """
    Robust extraction across SDK response shapes.
    """
    try:
        if hasattr(resp, "choices"):
            choice = resp.choices[0]
            # attribute-style
            if hasattr(choice, "message") and hasattr(choice.message, "content"):
                return choice.message.content
            # dict-style
            if isinstance(choice, dict):
                return choice.get("message", {}).get("content") or choice.get("text")
        if isinstance(resp, dict):
            return resp.get("choices", [{}])[0].get("message", {}).get("content") or resp.get("choices", [{}])[0].get("text")
    except Exception:
        pass
    # Fallback: try string representation
    return str(resp)


def chunk_by_paragraph_groups(text: str, paragraphs_per_chunk: PARAGRAPHS_PER_CHUNK,
                              enforce_token_limit: bool=False, max_input_tokens: int=None):
    """
    Split text into chunks where each chunk contains exactly `paragraphs_per_chunk` paragraphs
    (a paragraph is separated by two or more newlines). The final chunk may contain fewer paragraphs.
    If enforce_token_limit=True and a group exceeds max_input_tokens (estimated), it will optionally
    fall back to the original token-aware chunker for that particular group.
    """
    # split into paragraphs by two-or-more newlines, trim, drop empties
    paras = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    total_paras = len(paras)
    if total_paras == 0:
        return []

    # group paragraphs_per_chunk paras each
    groups = []
    for i in range(0, total_paras, paragraphs_per_chunk):
        group_paras = paras[i:i + paragraphs_per_chunk]
        group_text = "\n\n".join(group_paras)
        # optional token-limit enforcement for a group
        if enforce_token_limit and max_input_tokens is not None:
            est = estimate_tokens(group_text)
            # if group is too big, fall back to the token-based chunker for this group
            if est > max_input_tokens:
                # use the original token-aware chunker (preserves paragraph logic inside)
                sub_chunks = chunk_text_by_token_limit(group_text, max_input_tokens=max_input_tokens,
                                                       safety_margin_tokens=SAFETY_MARGIN_TOKENS)
                # extend groups with the fallback sub-chunks
                groups.extend(sub_chunks)
                continue
        groups.append(group_text)
    return groups


# ------------------------------- Main processing (modified) -------------------------------
def Summarization(LONG_TEXT: str):
    if not LONG_TEXT.strip():
        raise RuntimeError("LONG_TEXT is empty. Paste your text into the LONG_TEXT variable in the script.")

    # 1) Split text into chunks
        # Use paragraph-groups chunking (4 paragraphs per chunk)
    chunks = chunk_by_paragraph_groups(LONG_TEXT, paragraphs_per_chunk=PARAGRAPHS_PER_CHUNK,
                                      enforce_token_limit=ENFORCE_TOKEN_LIMIT_ON_GROUP,
                                      max_input_tokens=MAX_INPUT_TOKENS if ENFORCE_TOKEN_LIMIT_ON_GROUP else None)
    num_chunks = len(chunks)
    # Decide whether to use alternate prompt for the whole run (global switch)
    use_alt_globally = False
    if TRIGGER_CHUNK_COUNT is not None and num_chunks == TRIGGER_CHUNK_COUNT:
        use_alt_globally = True
       
    all_parts = []
    per_chunk_word_counts = []

    for idx, chunk in enumerate(chunks, start=1):
        est_tokens = estimate_tokens(chunk)
        # Choose system prompt for this chunk
        if use_alt_globally:
            system_for_this_chunk = SYSTEM_PROMPT_ALT
        else:
            # If per-chunk trigger is set and matches this idx, use ALT for this chunk
            if TRIGGER_CHUNK_INDEX is not None and idx == TRIGGER_CHUNK_INDEX:
                system_for_this_chunk = SYSTEM_PROMPT_ALT
            else:
                system_for_this_chunk = SYSTEM_PROMPT

        messages = [
            {"role": "system", "content": system_for_this_chunk},
            {"role": "user", "content": chunk}
        ]
        # Call the API with backoff
        try:
            resp = call_chat_with_backoff(groq_client, model=MODEL_NAME, messages=messages,
                                         max_retries=MAX_RETRIES, base_wait=1.0,
                                         max_response_tokens=CHUNK_RESPONSE_MAX_TOKENS)
        except Exception as e:
            raise

        # Extract the assistant's content robustly
        translation = extract_text_from_response(resp)
        if translation is None:
            raise RuntimeError(f"Empty response for chunk {idx}")

        translation = translation.strip()
        # Word count for the model's response (per chunk)
        words = re.findall(r"\b\w+\b", translation)
        wc = len(words)
        per_chunk_word_counts.append(wc)

        all_parts.append({
            "chunk_index": idx,
            "chunk_estimated_tokens": est_tokens,
            "chunk_chars": len(chunk),
            "response_text": translation,
            "response_word_count": wc,
            "used_alt_prompt": system_for_this_chunk is SYSTEM_PROMPT_ALT
        })

    # Combine all outputs into one large response
    combined_sections = []
    for p in all_parts:
        combined_sections.append(p["response_text"])
    combined_text = "\n".join(combined_sections)
    combined_text = combined_text.replace("\n", "")
    return combined_text
