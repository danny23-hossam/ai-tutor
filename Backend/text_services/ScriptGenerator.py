import dotenv
import time
import re
import traceback
from openai import OpenAI

# ------------------------------- Configuration -------------------------------
MODEL_NAME = "openai/gpt-oss-20b"
SAFETY_MARGIN_TOKENS = 256
MAX_RETRIES = 4
MAX_INPUT_TOKENS = 1000
CHUNK_RESPONSE_MAX_TOKENS = 1500
GROQ_TPM_WAIT_SECONDS = 65

API_KEY = dotenv.get_key(".env", "GROQ_API_KEY")
groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=API_KEY)

# ------------------------------- TTS Prompts -------------------------------

PROMPT_SINGLE = """
You are a professional educational audio-script writer.

Task:
Rewrite the input into one complete lecturer-style English narration for Chatterbox TTS.

The transcript must feel like a full lecture-style explanation with:
1. A fixed opening.
2. A clear introduction to the topic.
3. A well-organized middle explanation.
4. A short conclusion.
5. A fixed closing message.

Fixed opening:
"Hello, my dear viewers, and welcome to a new audio from Papyrus."

Fixed closing:
"Thank you for listening, and see you in the next Papyrus explanation."

Hard rules:
- Return only plain speakable narration text.
- Start exactly with the fixed opening.
- End exactly with the fixed closing.
- Do not add anything before the opening or after the closing.
- Do not output JSON, Markdown, headings, bullet lists, tables, SSML, XML, or HTML.
- Do not output line breaks, escaped newline text like \\n, or paragraph separators. Return one continuous text string.
- Do not output LaTeX delimiters such as \\( \\), \\[ \\], dollar signs, braces, underscores, or superscript/subscript symbols.
- Spell mathematical variables and formulas in plain spoken words.
- Use normal ASCII apostrophes and hyphens instead of curly quotes, non-breaking hyphens, or unusual Unicode symbols.
- Remove citations, page numbers, references, footnotes, author emails, and bibliography.
- Keep the important technical content, but explain it like a lecturer speaking to students.
- Use a warm, confident lecturer tone.
- Use short natural sentences, usually 10-18 words.
- Convert equations and symbols into spoken explanations.
- Do not read raw formulas unless absolutely necessary.
- Use [pause] after important ideas.
- Use [transition] when moving to a new major idea.
- Make the introduction brief and useful, not dramatic.
- Make the middle build the explanation step by step.
- Keep the audio complete but focused: target about 5-7 minutes for a normal document, roughly 750-1050 words.
- Preserve everything lecture-relevant needed to understand the topic, including core definitions, mechanisms, comparisons, equations, examples, applications, and conclusions.
- Describe the core points clearly and include useful illustrative details that help the listener understand why each idea matters.
- Use short examples or analogies for difficult or central ideas, but avoid long stories.
- Remove repetition, filler, long setup, and side details that do not support the lecture's main understanding.
- Develop the ideas enough to feel like a real lecture while keeping the same style and structure.
- Make the conclusion summarize the main idea without adding new facts.
- Do not mention that this was rewritten, chunked, generated, or converted.
"""

PROMPT_FIRST = """
You are a professional educational audio-script writer.

Task:
Rewrite the input into the first part of one continuous lecturer-style English narration for Chatterbox TTS.

Fixed opening:
"Hello, my dear viewers, and welcome to a new audio from Papyrus."

Hard rules:
- Return only plain speakable narration text.
- Start exactly with the fixed opening.
- After the opening, add a brief 1-3 sentence introduction that tells the listener what they will understand.
- Do not add a conclusion, closing summary, or farewell in this part.
- Do not output JSON, Markdown, headings, bullet lists, tables, SSML, XML, or HTML.
- Do not output line breaks, escaped newline text like \\n, or paragraph separators. Return one continuous text string.
- Do not output LaTeX delimiters such as \\( \\), \\[ \\], dollar signs, braces, underscores, or superscript/subscript symbols.
- Spell mathematical variables and formulas in plain spoken words.
- Use normal ASCII apostrophes and hyphens instead of curly quotes, non-breaking hyphens, or unusual Unicode symbols.
- Remove citations, page numbers, references, footnotes, author emails, and bibliography.
- Keep all important technical content, but explain it like a lecturer speaking to students.
- Include every lecture-relevant point from this part, with enough explanation to preserve the full meaning.
- Add a brief example, analogy, or application when it clarifies a core idea.
- Remove repetition, filler, and side details that do not support the lecture's main understanding.
- Use a warm, confident lecturer tone.
- Use short natural sentences, usually 10-18 words.
- Convert equations and symbols into spoken explanations.
- Do not read raw formulas unless absolutely necessary.
- Use [pause] after important ideas.
- Use [transition] when moving to a new major idea.
- This is the first part of one continuous audio transcript.
- Do not add any later restart, second intro, title, or new-episode wording.
- Do not mention chunks, processing, or generation.
"""

PROMPT_MID = """
You are a professional educational audio-script writer.

Task:
Continue the same lecturer-style English narration for Chatterbox TTS.

Hard rules:
- Return only plain speakable narration text.
- Do not add a greeting, title, opening, new introduction, conclusion, closing summary, or farewell.
- Continue directly from the previous idea as if there was no chunk boundary.
- Do not output JSON, Markdown, headings, bullet lists, tables, SSML, XML, or HTML.
- Do not output line breaks, escaped newline text like \\n, or paragraph separators. Return one continuous text string.
- Do not output LaTeX delimiters such as \\( \\), \\[ \\], dollar signs, braces, underscores, or superscript/subscript symbols.
- Spell mathematical variables and formulas in plain spoken words.
- Use normal ASCII apostrophes and hyphens instead of curly quotes, non-breaking hyphens, or unusual Unicode symbols.
- Keep all important technical content, but explain it naturally.
- Include every lecture-relevant point from this part, with enough explanation to preserve the full meaning.
- Add a brief example, analogy, or application when it clarifies a core idea.
- Do not expand into filler or side discussion beyond the lecture's main understanding.
- Use a warm lecturer tone, not a report tone.
- Use short natural sentences, usually 10-18 words.
- Convert equations and symbols into spoken explanations.
- Do not read raw formulas unless absolutely necessary.
- Use [pause] after important ideas.
- Use [transition] when moving to a new major idea.
- Do not say phrases like "in this section", "now we start", or "let us begin".
- Keep the same narrator voice, pace, and flow across all chunks.
"""

PROMPT_LAST = """
You are a professional educational audio-script writer.

Task:
Finish the same lecturer-style English narration for Chatterbox TTS.

Fixed closing:
"Thank you for listening, and see you in the next Papyrus explanation."

Hard rules:
- Return only plain speakable narration text.
- Do not add a greeting, title, opening, or new introduction.
- Continue directly from the previous idea.
- Do not output JSON, Markdown, headings, bullet lists, tables, SSML, XML, or HTML.
- Do not output line breaks, escaped newline text like \\n, or paragraph separators. Return one continuous text string.
- Do not output LaTeX delimiters such as \\( \\), \\[ \\], dollar signs, braces, underscores, or superscript/subscript symbols.
- Spell mathematical variables and formulas in plain spoken words.
- Use normal ASCII apostrophes and hyphens instead of curly quotes, non-breaking hyphens, or unusual Unicode symbols.
- Keep all important technical content, but explain it naturally.
- Finish the remaining explanation fully before the conclusion.
- Include useful illustrative detail when it clarifies a final core idea.
- Remove repetition, filler, and side details while preserving all needed final points.
- Use a warm lecturer tone, not a report tone.
- Use short natural sentences, usually 10-18 words.
- Convert equations and symbols into spoken explanations.
- Do not read raw formulas unless absolutely necessary.
- Use [pause] after important ideas.
- Use [transition] before the final recap.
- End with a clear 1-3 sentence conclusion that summarizes the main idea.
- The final sentence must be exactly the fixed closing.
- Do not add anything after the fixed closing.
- This is the final part of one continuous audio transcript.
- Only the final ending should sound like a conclusion.
"""
# ------------------------------- Helpers -------------------------------

def estimate_tokens(text: str) -> int:
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except:
        return max(1, int(len(text) / 4))

def chunk_text_by_token_limit(text: str, max_input_tokens: int):
    max_tokens_per_chunk = max(64, max_input_tokens - SAFETY_MARGIN_TOKENS)
    paragraphs = re.split(r'\n{2,}', text)
    chunks = []
    current = ""

    def flush_current():
        nonlocal current
        if current:
            chunks.append(current)
            current = ""

    def add_piece(piece: str):
        nonlocal current
        piece = piece.strip()
        if not piece:
            return
        candidate = (current + "\n\n" + piece).strip() if current else piece
        if estimate_tokens(candidate) <= max_tokens_per_chunk:
            current = candidate
            return
        flush_current()
        if estimate_tokens(piece) <= max_tokens_per_chunk:
            current = piece
            return
        approx_chars = max_tokens_per_chunk * 4
        for i in range(0, len(piece), approx_chars):
            part = piece[i:i + approx_chars].strip()
            if part:
                chunks.append(part)

    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if estimate_tokens(p) > max_tokens_per_chunk:
            for sentence in re.split(r'(?<=[.!?])\s+', p):
                add_piece(sentence)
        else:
            add_piece(p)
    flush_current()
    return chunks

def call_chat_with_backoff(client, model, messages):
    for attempt in range(MAX_RETRIES):
        try:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=CHUNK_RESPONSE_MAX_TOKENS,
            )
        except Exception as e:
            txt = str(e).lower()
            if "tokens per minute" in txt or "rate_limit_exceeded" in txt:
                if attempt == MAX_RETRIES - 1:
                    raise
                time.sleep(GROQ_TPM_WAIT_SECONDS)
                continue
            if attempt == MAX_RETRIES - 1: raise
            time.sleep(1 * (2 ** attempt))
    raise RuntimeError("Exhausted retries")

def convert_transitions_to_ssml(text: str) -> str:
    normalized = text.replace("[ transition ]", "[transition]").replace("[Transition]", "[transition]")
    normalized = normalized.replace("[pause ]", "[pause]").replace("[ Pause ]", "[pause]")
    ssml = normalized.replace("[transition]", '<break time="600ms"/>')
    ssml = ssml.replace("[pause]", '<break time="200ms"/>')
    return f"<speak>\n{ssml}\n</speak>"


def clean_for_chatterbox_script(text: str) -> str:
    """
    Final safety pass before returning transcript text to the pipeline.
    Chatterbox can handle whitespace, but plain narration without markup is safer.
    """

    if not text:
        return ""

    text = text.strip()

    # Preserve pause controls while removing other bracketed/coded notation.
    text = re.sub(r"\[pause\]", " [pause] ", text, flags=re.IGNORECASE)
    text = re.sub(r"\[transition\]", " [transition] ", text, flags=re.IGNORECASE)

    replacements = {
        "\\n": " ",
        "\\r": " ",
        "\r": " ",
        "\n": " ",
        "\t": " ",
        "\u00a0": " ",
        "\u200b": "",
        "\u200c": "",
        "\u200d": "",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": " minus ",
        "\u00d7": " times ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    # Remove common mojibake sequences from UTF-8 text read as Windows-1252.
    mojibake_replacements = {
        "â€™": "'",
        "â€˜": "'",
        "â€œ": '"',
        "â€": '"',
        "â€“": "-",
        "â€”": "-",
        "â€‘": "-",
        "â€¯": " ",
        "Â ": " ",
        "Â": "",
    }
    for old, new in mojibake_replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\u00e2\u20ac.", " ", text)

    # Convert common LaTeX/math formatting into plain speakable text.
    text = text.replace("\\(", " ").replace("\\)", " ")
    text = text.replace("\\[", " ").replace("\\]", " ")
    text = text.replace("$", " ")
    text = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"\1 over \2", text)
    text = re.sub(r"\\sqrt\{([^{}]+)\}", r"square root of \1", text)
    text = re.sub(r"\\operatorname\{([^{}]+)\}", r"\1", text)
    text = re.sub(r"\\text\{([^{}]+)\}", r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+", " ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"(?<=\w)_(?=\w)", " ", text)
    text = re.sub(r"(?<=\w)\^(?=\w|\d)", " to the power of ", text)

    # Remove markdown and labels that are unsafe or unnatural for TTS.
    text = re.sub(r"#{1,6}\s*", " ", text)
    text = text.replace("**", "").replace("*", "")
    text = text.replace("|", " ")
    text = text.replace("`", " ")
    text = re.sub(r"\S+@\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[(?!pause\]|transition\])\d+\]", " ", text, flags=re.IGNORECASE)

    # Restore control markers exactly and collapse everything to one safe line.
    text = text.replace("[ pause ]", "[pause]")
    text = text.replace("[ transition ]", "[transition]")
    text = text.replace("[pause]", " [pause] ")
    text = text.replace("[transition]", " [transition] ")
    text = re.sub(r"\s+", " ", text)

    return text.strip()

# ------------------------------- Main Function -------------------------------

def transform_to_friendly_script(input_text: str):
    chunks = chunk_text_by_token_limit(input_text, MAX_INPUT_TOKENS)
    num_chunks = len(chunks)
    transformed_parts = []

    for idx, chunk in enumerate(chunks, start=1):
        if num_chunks == 1:
            system_prompt = PROMPT_SINGLE
        elif idx == 1:
            system_prompt = PROMPT_FIRST
        elif idx == num_chunks:
            system_prompt = PROMPT_LAST
        else:
            system_prompt = PROMPT_MID

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": chunk}
        ]

        resp = call_chat_with_backoff(groq_client, MODEL_NAME, messages)
        transformed_parts.append(resp.choices[0].message.content.strip())

    combined_script = "\n\n".join(transformed_parts)
    return clean_for_chatterbox_script(combined_script)
