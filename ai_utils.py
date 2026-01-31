import os
import json
import requests
from typing import Optional

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Pick your Sonnet model on OpenRouter
MAIN_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")

# Optional metadata (you can omit these)
APP_URL = os.getenv("APP_URL", "http://localhost")
APP_TITLE = os.getenv("APP_TITLE", "Coding Tutor")

SYSTEM_POLICY = """You are a coding tutor embedded in an educational app.

Hard rules:
- Do NOT provide complete working solutions for the user's assignment/project.
- Do NOT output full end-to-end implementations that would pass the assignment as-is.
- If asked for “the answer” or “full code”, refuse briefly and offer hints and questions instead.

Allowed:
- Clarifying questions, conceptual help, debugging guidance, pseudocode,
  small targeted snippets (<= 15 lines) ONLY when user provides an attempt.

Behavior:
- Be Socratic: ask at least one clarifying question for ambiguous tasks.
- Focus on the project requirements; don’t invent requirements.
- If the user provides code, suggest localized edits rather than rewriting everything.
"""

def _openrouter_chat(model: str, system: str, user_payload: dict, max_tokens: int = 700, temperature: float = 0.5) -> str:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # optional, safe to remove:
        "HTTP-Referer": APP_URL,
        "X-Title": APP_TITLE,
    }

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }

    r = requests.post(OPENROUTER_URL, headers=headers, data=json.dumps(body), timeout=60)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]

def call_llm(text_from_user: str, code: Optional[str], project_description: str) -> str:
    """
    Tutor-style LLM call.

    Args:
      text_from_user: User's question / request.
      code: The user's current code attempt (can be None/empty).
      project_description: The assignment/project spec you want the model to follow.

    Returns:
      Assistant text (tutor response).
    """
    payload = {
        "text_from_user": text_from_user,
        "user_code": code or "",
        "project_description": project_description,
        "instructions": {
            "style": "tutor",
            "no_full_solutions": True,
            "prefer_hints_over_code": True
        }
    }

    return _openrouter_chat(
        model=MAIN_MODEL,
        system=SYSTEM_POLICY,
        user_payload=payload,
        max_tokens=700,
        temperature=0.5,
    )


if __name__ == "__main__":
    # Example usage
    project_desc = (
        "Project: Build a CLI TODO app.\n"
        "Requirements:\n"
        "- Commands: add, list, done, delete\n"
        "- Store data in a local JSON file\n"
        "- Use argparse\n"
        "Do not provide full final code; provide hints and small snippets only."
    )

    user_text = "I dont know how start , can you help me?"
    user_code = ""

    print(call_llm(user_text, user_code, project_desc))
