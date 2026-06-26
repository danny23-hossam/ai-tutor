import dotenv
import time
import re
import traceback
from openai import OpenAI

# ------------------------------- Configuration -------------------------------
MODEL_NAME = "openai/gpt-oss-20b"
MAX_INPUT_TOKENS = 2000
SAFETY_MARGIN_TOKENS = 256
MAX_RETRIES = 4
CHUNK_RESPONSE_MAX_TOKENS = 4000

API_KEY = dotenv.get_key(".env", "GROQ_API_KEY")
groq_client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=API_KEY)

# ------------------------------- TTS Prompts -------------------------------

PROMPT_FIRST = """
You are a professional audio-script writer for educational voice content.
Task: Take the input and rewrite it as a friendly, conversational English script for a single narrator.
Hard rules:
1. REMOVE out-of-context details (citations, page numbers, footnotes).
2. KEEP technical content but rephrase for spoken clarity.
3. Convert equations to spoken words (e.g., "x equals y squared").
4. Use short sentences (~12-18 words) and [pause] markers.
5. Add [transition] markers after transition sentences.
6. Start with: "Hello, my dear viewers, and welcome to a new audio of Papyrus," followed by a 1-3 sentence intro.
7. No summary/recap at the end.
8. This is the first part of one continuous audio transcript. Do not add any later restart, second intro, title, or new-episode wording.
"""

PROMPT_MID = """
You are a professional audio-script writer for educational voice content.
Task: Continue the conversational script.
Hard rules:
1. DO NOT start with an introduction; go straight to the topic.
2. Follow all standard rules (short sentences, [pause], [transition], spoken equations).
3. No summary/recap at the end.
4. This is the middle of one continuous audio transcript, split only for processing.
5. DO NOT restart the narration, add a new greeting, welcome sentence, title, or episode opening.
6. DO NOT say phrases like "now we start", "in this section", "let us begin", or anything that sounds like a new audio.
7. Continue naturally from the previous idea as if there was no chunk boundary.
8. Keep the same narrator voice, pace, and flow across all chunks.
"""

PROMPT_LAST = """
You are a professional audio-script writer for educational voice content.
Task: Finish the conversational script.
Hard rules:
1. DO NOT start with an introduction; go straight to the topic.
2. Follow all standard rules.
3. At the end, include a 2–6 sentence closing summary and thank the listeners for listening.
4. This is the final part of one continuous audio transcript, split only for processing.
5. DO NOT restart the narration, add a new greeting, welcome sentence, title, or episode opening.
6. Continue naturally from the previous idea as if there was no chunk boundary.
7. Only the final ending should sound like a conclusion.
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
    for p in paragraphs:
        if estimate_tokens(current + "\n\n" + p) <= max_tokens_per_chunk:
            current = (current + "\n\n" + p).strip() if current else p
        else:
            if current: chunks.append(current)
            current = p
    if current: chunks.append(current)
    return chunks

def call_chat_with_backoff(client, model, messages):
    for attempt in range(MAX_RETRIES):
        try:
            return client.chat.completions.create(model=model, messages=messages)
        except Exception:
            if attempt == MAX_RETRIES - 1: raise
            time.sleep(1 * (2 ** attempt))

def convert_transitions_to_ssml(text: str) -> str:
    normalized = text.replace("[ transition ]", "[transition]").replace("[Transition]", "[transition]")
    normalized = normalized.replace("[pause ]", "[pause]").replace("[ Pause ]", "[pause]")
    ssml = normalized.replace("[transition]", '<break time="600ms"/>')
    ssml = ssml.replace("[pause]", '<break time="200ms"/>')
    return f"<speak>\n{ssml}\n</speak>"

# ------------------------------- Main Function -------------------------------

def transform_to_friendly_script(input_text: str):
    chunks = chunk_text_by_token_limit(input_text, 4000)
    num_chunks = len(chunks)
    transformed_parts = []

    for idx, chunk in enumerate(chunks, start=1):
        if num_chunks == 1:
            system_prompt = PROMPT_FIRST # For a single chunk, we want the Intro
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
    return combined_script
