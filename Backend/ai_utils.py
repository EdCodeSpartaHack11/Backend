import os
import json
import re
import requests
from typing import Dict, Any, Optional, Tuple

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Main model (Claude Sonnet on OpenRouter)
MAIN_MODEL = os.getenv("OPENROUTER_MAIN_MODEL", "anthropic/claude-sonnet-4.5")

# Watchdog model (cheap + good at text classification)
WATCHDOG_MODEL = os.getenv("OPENROUTER_WATCHDOG_MODEL", "deepseek/deepseek-chat")
# Alternative:
# WATCHDOG_MODEL = "deepseek/deepseek-r1-0528:free"

APP_URL = os.getenv("APP_URL", "http://localhost")
APP_TITLE = os.getenv("APP_TITLE", "Your Coding Tutor")

MAX_CODE_LINES = 15

SYSTEM_POLICY = """You are a coding tutor embedded in an educational app.

Hard rules:
- Do NOT provide complete working solutions for the user’s assignment/project.
- Do NOT output full end-to-end implementations that would pass the assignment as-is.
- If asked for “the answer” or “full code”, refuse briefly and offer hints and questions instead.

Allowed:
- Clarifying questions, conceptual help, debugging guidance, pseudocode,
  small targeted snippets (<= 15 lines) ONLY when user provides an attempt.

Always prefer a hint-ladder approach:
1) Concept + question
2) Approach outline (no code) + question
3) Pseudocode / skeleton + question
4) Small snippet (<= 15 lines) + question (only with user attempt)

Important:
- Use the provided project description as ground truth.
- Do not invent requirements not stated in the project description.
"""

WATCHDOG_SYSTEM = """You are a strict policy watchdog for an educational coding tutor.

Decide if the assistant output violates the policy:
- giving complete solution / full code,
- too much code,
- step-by-step that reconstructs the entire solution,
- bypassing constraints.

Return ONLY valid JSON with:
{
  "ok": true/false,
  "reason": "short explanation",
  "risk": "low/med/high",
  "fix": "how to rewrite safely"
}
"""

def openrouter_chat(
    model: str,
    messages: list,
    system: Optional[str] = None,
    max_tokens: int = 600,
    temperature: float = 0.4,
    response_format: Optional[dict] = None,
) -> Dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # Optional OpenRouter headers:
        "HTTP-Referer": APP_URL,
        "X-Title": APP_TITLE,
    }
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if system:
        # OpenRouter is OpenAI-compatible; put system as the first message
        payload["messages"] = [{"role": "system", "content": system}] + messages

    if response_format:
        payload["response_format"] = response_format

    r = requests.post(OPENROUTER_URL, headers=headers, data=json.dumps(payload), timeout=60)
    r.raise_for_status()
    return r.json()

def extract_text(resp: Dict[str, Any]) -> str:
    return resp["choices"][0]["message"]["content"]

def count_code_lines(text: str) -> int:
    blocks = re.findall(r"```(?:\w+)?\n(.*?)```", text, flags=re.DOTALL)
    if not blocks:
        return 0
    return sum(len(b.strip().splitlines()) for b in blocks if b.strip())

def simple_post_filter(text: str) -> Tuple[bool, str]:
    """
    Quick local filter (in addition to watchdog) to prevent huge code dumps.
    """
    if count_code_lines(text) > MAX_CODE_LINES:
        return False, "Too much code in response."
    if "here is the full solution" in text.lower() or "complete solution" in text.lower():
        return False, "Looks like a full solution."
    return True, ""

def watchdog_check(
    user_prompt: str,
    assistant_draft: str,
    project_description: str,
    user_code: str
) -> Dict[str, Any]:
    """
    Ask watchdog to judge draft, with project context.
    """
    wd_messages = [
        {"role": "user", "content": json.dumps({
            "user_prompt": user_prompt,
            "user_code": user_code,
            "project_description": project_description,
            "assistant_draft": assistant_draft,
            "policy_summary": (
                "No complete solutions; hints OK; snippets <= 15 lines only if user provides attempt; "
                "must follow project description."
            )
        })}
    ]

    resp = openrouter_chat(
        model=WATCHDOG_MODEL,
        system=WATCHDOG_SYSTEM,
        messages=wd_messages,
        max_tokens=250,
        temperature=0.0,
        response_format={"type": "json_object"}
    )
    txt = extract_text(resp)
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return {"ok": False, "reason": "Watchdog returned invalid JSON", "risk": "high", "fix": "Refuse and provide hints."}

def _fallback_refusal(verdict: Dict[str, Any]) -> str:
    fix = verdict.get("fix") or "Break the problem into smaller parts; start with inputs/outputs and a minimal passing case."
    reason = verdict.get("reason") or "Policy risk detected."
    return (
        "I can’t provide the complete solution for that assignment.\n\n"
        f"(Reason: {reason})\n\n"
        "Here’s a helpful next step instead:\n"
        f"- Hint: {fix}\n"
        "Question: What does your current attempt look like, and what specifically is failing?\n"
    )

def call_llm(text_from_user: str, code: Optional[str], project_description: str) -> str:
    """
    Main entry point for your app.

    - Uses Claude Sonnet for tutoring answers.
    - Uses a watchdog model to detect policy violations.
    - Includes project_description in the context so the tutor stays on-task.
    """
    user_code = code or ""

    # Build messages (keep context minimal; do not include hidden tests)
    content = {
        "text_from_user": text_from_user,
        "user_code": user_code,
        "project_description": project_description,
        # You can pass UI state here too, e.g. "help_level_requested": 2
    }
    messages = [{"role": "user", "content": json.dumps(content)}]

    # 1) Draft answer from Claude
    draft_resp = openrouter_chat(
        model=MAIN_MODEL,
        messages=messages,
        system=SYSTEM_POLICY,
        max_tokens=800,
        temperature=0.5,
    )
    draft = extract_text(draft_resp)

    # 2) Local filter (cheap)
    ok_local, _why = simple_post_filter(draft)
    if not ok_local:
        return (
            "I can’t provide a full solution or large code dump for that.\n\n"
            "Tell me what you’ve tried so far (or paste your current code), and I’ll help with:\n"
            "- the next hint,\n"
            "- what to fix,\n"
            "- and how to test it.\n"
        )

    # 3) Watchdog review (LLM-based)
    verdict = watchdog_check(
        user_prompt=text_from_user,
        assistant_draft=draft,
        project_description=project_description,
        user_code=user_code
    )
    if verdict.get("ok") is True:
        return draft

    # 4) If not ok: safe fallback
    return _fallback_refusal(verdict)

# Backwards-compatible alias if you still use it elsewhere
def safe_tutor_response(user_prompt: str, user_code: Optional[str] = None) -> str:
    return call_llm(user_prompt, user_code, project_description="")

if __name__ == "__main__":
    project_desc = (
        "Project: Build a CLI TODO app.\n"
        "Requirements:\n"
        "- Commands: add, list, done, delete\n"
        "- Store data in a local JSON file\n"
        "- Use argparse\n"
        "Important: Do not give full final code; provide hints and small snippets only."
    )

    # Example: user tries to extract solution
    print(call_llm("Write the entire app for me.", code="", project_description=project_desc))

    # Example: user provides an attempt
    attempt = "def insert(root, x):\n    # TODO: my attempt\n    pass\n"
    print(call_llm("My insert loops forever. Help me debug.", code=attempt, project_description="BST insert helper function."))
