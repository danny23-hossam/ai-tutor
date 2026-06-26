import dotenv
import time
import re
import os
import random
from pathlib import Path
from openai import OpenAI

# ------------------------------- Settings  -------------------------------
MODEL_NAME = "openai/gpt-oss-20b"

MAX_INPUT_TOKENS = 3000
SAFETY_MARGIN_TOKENS = 256
MAX_RETRIES = 4

NUM_FEW_SHOT_EXAMPLES = 1
EXAMPLE_EXCERPT_CHARS = 1800
EXAMPLES_DIR = "scripts"

API_KEY = dotenv.get_key(".env", "GROQ_API_KEY")
groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=API_KEY)
# ------------------------------- Load Example Scripts -------------------------------

def load_example_scripts(directory: str) -> list[str]:
    """
    Loads all .txt files from the examples directory.
    Each file should be a full Arabic script example.
    """
    examples = []
    path = Path(directory)

    if not path.exists():
        print(f"⚠️  Examples directory '{directory}' not found. Using default one-shot only.")
        return examples

    for txt_file in sorted(path.glob("*.txt")):
        content = txt_file.read_text(encoding="utf-8").strip()
        if content:
            examples.append(content)

    print(f"✅ Loaded {len(examples)} Arabic example scripts from '{directory}'")
    return examples


ARABIC_EXAMPLES: list[str] = load_example_scripts(EXAMPLES_DIR)


# ------------------------------- Helpers -------------------------------

def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / 4))


def call_chat_with_backoff(client, model, messages, max_retries=MAX_RETRIES, base_wait=1.0):
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(model=model, messages=messages)
        except Exception as e:
            if attempt == max_retries - 1:
                raise e

            wait = base_wait * (2 ** attempt)
            print(f"  ⚠️  Retry {attempt + 1}/{max_retries} after {wait:.0f}s — {e}")
            time.sleep(wait)


def chunk_text_by_token_limit(text: str, max_input_tokens: int) -> list[str]:
    max_tokens_per_chunk = max(64, max_input_tokens - SAFETY_MARGIN_TOKENS)

    paragraphs = re.split(r"\n{2,}", text)
    chunks = []
    current = ""

    for p in paragraphs:
        p = p.strip()
        if not p:
            continue

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


def build_few_shot_block(
    examples: list[str],
    n: int,
    excerpt_chars: int,
    seed_text: str = ""
) -> str:
    if not examples:
        return "(no examples loaded)"

    pool = examples.copy()

    if seed_text:
        seed_words = set(re.findall(r"\w+", seed_text.lower()))
        pool.sort(
            key=lambda ex: len(seed_words & set(re.findall(r"\w+", ex.lower()))),
            reverse=True
        )
        pool = pool[:max(n * 3, 10)]

    selected = random.sample(pool, min(n, len(pool)))

    blocks = []
    for i, ex in enumerate(selected, 1):
        start = max(0, len(ex) // 4)
        excerpt = ex[start:start + excerpt_chars].strip()
        blocks.append(f"--- Example {i} ---\n{excerpt}\n")

    return "\n".join(blocks)


# Keep this only if you need it later.
# For XTTS now, we are NOT using SSML.
def convert_to_arabic_ssml(text: str) -> str:
    ssml = text.replace("[transition]", '<break time="600ms"/>')
    ssml = ssml.replace("[pause]", '<break time="200ms"/>')
    return f"<speak xml:lang='ar-EG'>\n{ssml}\n</speak>"


def clean_for_xtts_script(text: str) -> str:
    """
    Final cleanup for XTTS.

    Goal:
    - Same generated style
    - Plain speakable narration
    - No markdown
    - No tables
    - No raw LaTeX
    - No author emails/references
    - Keeps [pause] and [transition]
    - One-line string safe to send as JSON value
    """

    if not text:
        return ""

    text = text.strip()

    # Normalize pause markers
    text = re.sub(r"\[pause\]", " [pause] ", text, flags=re.IGNORECASE)
    text = re.sub(r"\[transition\]", " [transition] ", text, flags=re.IGNORECASE)

    # Remove English/Arabic step labels
    text = re.sub(r"\bStep\s*[0-9٠-٩]+\s*[–—:\-]?", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"الخطوة\s*[0-9٠-٩]+\s*[–—:\-]?", " ", text, flags=re.IGNORECASE)

    # Remove unwanted structural labels
    unwanted_titles = [
        "Outline",
        "Section-by-section",
        "Section by section",
        "Context & Motivation",
        "Context and Motivation",
        "Summary",
        "Overall Takeaway",
        "Takeaway",
        "Mathematical detail",
        "Mathematical details",
        "Author’s choice",
        "Author's choice",
        "Design trade-offs",
        "المخطط",
        "مخطط",
        "القسم بالقسم",
        "قسمًا بآخر",
        "السياق والدافع",
        "السياق والتحفيز",
        "الخلاصة",
        "ملخص",
        "التفاصيل الرياضية",
        "اختيار المؤلف",
        "المقايضة التصميمية",
    ]

    for title in unwanted_titles:
        text = re.sub(re.escape(title), " ", text, flags=re.IGNORECASE)

    # Remove markdown headings and emphasis
    text = re.sub(r"#{1,6}\s*", " ", text)
    text = text.replace("**", "")
    text = text.replace("*", "")

    # Remove horizontal separators
    text = re.sub(r"-{3,}", " ", text)
    text = re.sub(r"_{3,}", " ", text)

    # Remove markdown tables line by line
    lines = text.splitlines()
    cleaned_lines = []

    for line in lines:
        stripped = line.strip()

        # Skip table rows
        if stripped.startswith("|") and stripped.endswith("|"):
            continue

        # Skip table separator rows
        if re.match(r"^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$", stripped):
            continue

        cleaned_lines.append(line)

    text = " ".join(cleaned_lines)

    # Remove bullet and numbered list prefixes
    text = re.sub(r"^\s*[-•]\s+", " ", text, flags=re.MULTILINE)
    text = re.sub(r"\b\d+\.\s+", " ", text)
    text = re.sub(r"[٠-٩]+\.\s+", " ", text)

    # Remove emails
    text = re.sub(r"\S+@\S+", " ", text)

    # Remove references like [38], [2], [9], but keep [pause] and [transition]
    text = re.sub(
        r"\[(?!pause\]|transition\])\d+\]",
        " ",
        text,
        flags=re.IGNORECASE
    )

    # Remove citation-like expressions
    text = re.sub(r"\([^)]*et\s+al\.?,?\s*\d{4}[^)]*\)", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b[A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s*\(\d{4}\)", " ", text)

    # Remove SSML/XML/HTML if generated accidentally
    text = re.sub(r"<[^>]+>", " ", text)

    # Remove LaTeX block markers
    text = text.replace("\\[", " ")
    text = text.replace("\\]", " ")
    text = text.replace("\\(", " ")
    text = text.replace("\\)", " ")

    # Convert common LaTeX commands to speakable words
    text = re.sub(r"\\operatorname\{softmax\}", " softmax ", text)
    text = re.sub(r"\\text\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\frac\{([^}]*)\}\{([^}]*)\}", r"\1 over \2", text)
    text = re.sub(r"\\sqrt\{([^}]*)\}", r"square root of \1", text)

    # Keep math/technical terms in English
    text = re.sub(r"\\log", " log ", text)
    text = re.sub(r"\\sin", " sine ", text)
    text = re.sub(r"\\cos", " cosine ", text)
    text = re.sub(r"\\tan", " tangent ", text)
    text = re.sub(r"\\sum", " summation ", text)
    text = re.sub(r"\\max", " max ", text)
    text = re.sub(r"\\min", " min ", text)
    text = re.sub(r"\\exp", " exp ", text)

    # Remove remaining LaTeX commands
    text = re.sub(r"\\[a-zA-Z]+", " ", text)

    # Remove braces
    text = text.replace("{", " ")
    text = text.replace("}", " ")

    # Remove leftover markdown/table characters
    text = text.replace("|", " ")
    text = text.replace("`", " ")

    # Remove raw newlines to make it safe as JSON string value
    text = text.replace("\r", " ")
    text = text.replace("\n", " ")

    # Normalize spaces
    text = re.sub(r"\s+", " ", text)

    # Restore pause markers exactly
    text = text.replace("[ pause ]", "[pause]")
    text = text.replace("[ transition ]", "[transition]")
    text = text.replace("[pause]", " [pause] ")
    text = text.replace("[transition]", " [transition] ")

    # Final space cleanup
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ================================================================
#  STEP 1 — Pure Translation: English → Raw Arabic
# ================================================================

TRANSLATE_PROMPT_FIRST = """
You are a translator. Translate the English script below into Modern Standard Arabic (MSA).

RULES:
- Translate faithfully and completely, do not skip or add anything.
- Do not skip or summarize in translation.
- Preserve [pause] and [transition] tokens exactly where they appear.
- Do not add markdown tables.
- Do not add bullet-heavy formatting.
- Start with: "أعزائي المشاهدين السلام عليكم ورحمة الله وبركاته أهلا بكم في شرح جديد من (papyrus)"
"""

TRANSLATE_PROMPT_MID = """
You are a translator. Continue translating the English script into Modern Standard Arabic (MSA).

RULES:
- Do NOT add an intro or greeting, go straight into the content.
- Translate faithfully and completely, do not skip or add anything.
- Do not skip or summarize in translation.
- Preserve [pause] and [transition] tokens.
- Do not add markdown tables.
- Do not add bullet-heavy formatting.
"""

TRANSLATE_PROMPT_LAST = """
You are a translator. Translate the final section of the English script into Modern Standard Arabic (MSA).

RULES:
- Do NOT add an intro or greeting.
- Translate faithfully and completely, do not skip or add anything.
- Do not skip or summarize in translation.
- Preserve [pause] and [transition] tokens.
- Add a short neutral closing, 1–2 sentences, thanking the listeners.
- Do not add markdown tables.
- Do not add bullet-heavy formatting.
"""


TRANSLATION_CONTINUITY_FIRST = """
CONTINUITY RULES:
- This is the first part of one continuous audio transcript.
- Do not add any later restart, second intro, title, or new-episode wording.
"""

TRANSLATION_CONTINUITY_MID = """
CONTINUITY RULES:
- This is the middle of one continuous audio transcript, split only for processing.
- Do NOT restart the narration, add a new greeting, welcome sentence, title, or episode opening.
- Continue naturally from the previous idea as if there was no chunk boundary.
- Keep the same narrator voice, pace, and flow across all chunks.
"""

TRANSLATION_CONTINUITY_LAST = """
CONTINUITY RULES:
- This is the final part of one continuous audio transcript, split only for processing.
- Do NOT restart the narration, add a new greeting, welcome sentence, title, or episode opening.
- Continue naturally from the previous idea as if there was no chunk boundary.
- Only the final ending should sound like a conclusion.
"""


def step1_translate(english_script: str) -> str:
    """
    Step 1: Pure English → Arabic translation, no style applied.
    Returns the raw Arabic translation as a single string.
    """

    chunks = chunk_text_by_token_limit(english_script, 1500)
    num_chunks = len(chunks)
    translated_parts = []

    print(f"\n🔵 STEP 1 — Translation ({num_chunks} chunk(s))")

    for idx, chunk in enumerate(chunks, start=1):
        print(f"  Translating chunk {idx}/{num_chunks}...")

        if num_chunks == 1 or idx == 1:
            system_prompt = TRANSLATE_PROMPT_FIRST
            system_prompt += TRANSLATION_CONTINUITY_FIRST
        elif idx == num_chunks:
            system_prompt = TRANSLATE_PROMPT_LAST
            system_prompt += TRANSLATION_CONTINUITY_LAST
        else:
            system_prompt = TRANSLATE_PROMPT_MID
            system_prompt += TRANSLATION_CONTINUITY_MID

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": chunk}
        ]

        resp = call_chat_with_backoff(groq_client, MODEL_NAME, messages)
        translated_parts.append(resp.choices[0].message.content.strip())

    raw_arabic = "\n\n".join(translated_parts)

    print(f"  ✅ Step 1 done — {estimate_tokens(raw_arabic)} tokens of raw Arabic.")
    return raw_arabic


# ================================================================
#  STEP 2 — Style Transfer: Raw Arabic → Toned Egyptian Arabic
# ================================================================

XTTS_RULES = """
XTTS OUTPUT RULES:
- Return only plain speakable narration text.
- The output must be suitable to send directly to the XTTS /tts endpoint as the "text" field.
- Do not output JSON.
- Do not output SSML.
- Do not output <speak>, <break>, HTML, XML, or Markdown.
- Do not use markdown headings such as ## or ###.
- Do not use bold markers like **.
- Do not use tables.
- Do not use bullet-heavy formatting.
- Do not use numbered lists unless the list is rewritten as natural speech.
- If the input contains steps, tables, bullets, headings, or markdown, rewrite them into smooth narration.
- Do not preserve report-like structure.
- Do not write Step 1, Step 2, Step 3, Step 4.
- Do not write الخطوة 1, الخطوة 2, الخطوة 3, الخطوة 4.
- Do not write Outline, Section-by-section, Context, Motivation, or Summary as labels.
- Do not write مخطط، السياق، الدافع، الخلاصة، القسم بالقسم as labels.
- Do not include author emails, affiliations, bibliography, footnotes, or reference lists.
- Do not include raw LaTeX equations.
- Convert equations into simple spoken explanations.
- Keep technical English terms in English when commonly spoken in English, such as Transformer, attention, self-attention, softmax, BLEU, Adam, ReLU, RNN, LSTM, GRU, CNN, GPU, log, sine, cosine.
- Preserve [pause] and [transition] exactly as plain tokens.
- Use [pause] between important ideas.
- Use [transition] when moving to a new major idea.
- Write natural Egyptian Arabic narration, not notes.
- Avoid very long sentences.
- Keep the warm direct-address energy, for example "عزيزي".
"""

STYLE_PROMPT_FIRST = """
You are a professional Egyptian Arabic script editor for educational TTS audio.

You will receive a raw Arabic translation. Your job is to rewrite it in the exact
tone, personality, and style shown in the examples below.

RULES:
- Keep the important educational information.
- Do not add fake facts.
- Remove unnecessary academic formatting.
- Rewrite into natural spoken Egyptian colloquial Arabic.
- If the input contains steps, tables, bullets, headings, or markdown, completely rewrite them into smooth narration.
- Do not preserve the structure of the input if it sounds like notes, a report, or an outline.
- Match the narration order from the examples: context → explanation → analogy → light joke if it matches the topic → continue.
- Preserve [pause] and [transition] tokens.
- The script must open with: "أعزائي المشاهدين السلام عليكم ورحمة الله وبركاته أهلا بكم في شرح جديد من papyrus"
- Remove any closing summary if it exists.

""" + XTTS_RULES + """

STYLE EXAMPLES — rewrite to match this exact voice:
{few_shot_block}
"""

STYLE_PROMPT_MID = """
You are a professional Egyptian Arabic script editor for educational TTS audio.

Rewrite the raw Arabic translation below in the tone and style shown in the examples.

RULES:
- Do NOT add a greeting or intro — go straight into content.
- Keep the important educational information.
- Do not add fake facts.
- Remove unnecessary academic formatting.
- Rewrite into natural spoken Egyptian colloquial Arabic.
- If the input contains steps, tables, bullets, headings, or markdown, completely rewrite them into smooth narration.
- Do not preserve the structure of the input if it sounds like notes, a report, or an outline.
- Match the narration order from the examples: context → explanation → analogy → light joke if it matches the topic → continue.
- Preserve [pause] and [transition] tokens.
- Remove any closing summary if it exists.

""" + XTTS_RULES + """

STYLE EXAMPLES:
{few_shot_block}
"""

STYLE_PROMPT_LAST = """
You are a professional Egyptian Arabic script editor for educational TTS audio.

Rewrite the final section of the raw Arabic translation in the tone shown in the examples.

RULES:
- Do NOT add a greeting or intro.
- Keep the important educational information.
- Do not add fake facts.
- Remove unnecessary academic formatting.
- Rewrite into natural spoken Egyptian colloquial Arabic.
- If the input contains steps, tables, bullets, headings, or markdown, completely rewrite them into smooth narration.
- Do not preserve the structure of the input if it sounds like notes, a report, or an outline.
- Match the narration order from the examples: context → explanation → analogy → light joke if it matches the topic → continue.
- Preserve [pause] and [transition] tokens.
- End with a 2–4 sentence colloquial closing summary, then thank listeners warmly in the same voice.

""" + XTTS_RULES + """

STYLE EXAMPLES:
{few_shot_block}
"""


STYLE_CONTINUITY_FIRST = """
CONTINUITY RULES:
- This is the first part of one continuous audio transcript.
- Do not add any later restart, second intro, title, or new-episode wording.
"""

STYLE_CONTINUITY_MID = """
CONTINUITY RULES:
- This is the middle of one continuous audio transcript, not a new audio.
- Do NOT add any greeting, welcome, title, intro, or restart phrase.
- Do NOT write anything that sounds like a new episode or a new lecture beginning.
- Do NOT say phrases like "now we start", "in this section", "let us begin", or similar restart wording.
- Continue directly from the previous idea with natural flow.
- Do not recap what was already explained unless needed in one short linking phrase.
- Keep the same narrator voice and pacing.
"""

STYLE_CONTINUITY_LAST = """
CONTINUITY RULES:
- This is the final part of one continuous audio transcript, not a new audio.
- Do NOT add any greeting, welcome, title, intro, or restart phrase.
- Do NOT write anything that sounds like a new episode or a new lecture beginning.
- Continue directly from the previous idea with natural flow.
- Keep the same narrator voice and pacing.
- Only the final ending should sound like a conclusion.
"""


def step2_apply_style(raw_arabic: str) -> str:
    """
    Step 2: Takes the raw Arabic from Step 1 and rewrites it
    in the tone/style of your few-shot examples.
    Returns the final styled Egyptian Arabic script.
    """

    chunks = chunk_text_by_token_limit(raw_arabic, 700)
    num_chunks = len(chunks)
    styled_parts = []

    print(f"\n🟠 STEP 2 — Style Transfer ({num_chunks} chunk(s))")

    for idx, chunk in enumerate(chunks, start=1):
        print(f"  Styling chunk {idx}/{num_chunks}...")

        few_shot_block = build_few_shot_block(
            ARABIC_EXAMPLES,
            n=NUM_FEW_SHOT_EXAMPLES,
            excerpt_chars=EXAMPLE_EXCERPT_CHARS,
            seed_text=chunk
        )

        if num_chunks == 1 or idx == 1:
            system_prompt = STYLE_PROMPT_FIRST.format(few_shot_block=few_shot_block)
            system_prompt += STYLE_CONTINUITY_FIRST
        elif idx == num_chunks:
            system_prompt = STYLE_PROMPT_LAST.format(few_shot_block=few_shot_block)
            system_prompt += STYLE_CONTINUITY_LAST
        else:
            system_prompt = STYLE_PROMPT_MID.format(few_shot_block=few_shot_block)
            system_prompt += STYLE_CONTINUITY_MID

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"RAW ARABIC TO REWRITE:\n\n{chunk}"}
        ]

        resp = call_chat_with_backoff(groq_client, MODEL_NAME, messages)
        styled_parts.append(resp.choices[0].message.content.strip())

    final_script = "\n\n".join(styled_parts)
    final_script = clean_for_xtts_script(final_script)
    
    print("  ✅ Step 2 done — XTTS-friendly final script ready.")
    return final_script


# ================================================================
#  MAIN — runs both steps, single endpoint
# ================================================================

def translate_to_egyptian_tts(english_script: str) -> dict:
    raw_arabic = step1_translate(english_script)
    final_script = step2_apply_style(raw_arabic)

    return {
        "text": final_script,
        "language": "ar"
    }
