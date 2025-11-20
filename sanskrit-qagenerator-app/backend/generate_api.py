import os
import json
import time
import random
import logging
import requests
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.exceptions import ReadTimeout, RequestException

# Configure logging
logger = logging.getLogger("sanskrit-qagenerator.generate_api")
logger.setLevel(logging.INFO)

# Create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Create console handler
ch = logging.StreamHandler()
ch.setFormatter(formatter)
logger.addHandler(ch)

# Config via backend/.env (defaults provided)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://141.147.4.167:8080").rstrip('/')
MAX_RETRIES = int(os.getenv("GEN_MAX_RETRIES", "3"))
RETRY_BACKOFF = float(os.getenv("GEN_RETRY_BACKOFF", "1.0"))
GEN_TIMEOUT = float(os.getenv("GEN_TIMEOUT", "180"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "4096"))  # Increased to prevent truncation

PROMPT_TEMPLATE = """
You are an expert scholar of Sanskrit literature, Ayurveda, and classical Indian knowledge traditions, fluent in English, Hindi (Devanagari), and Sanskrit (Devanagari).

Use ONLY the meaning contained in the provided shloka and its translation.  
However, your questions MUST NOT indicate, suggest, or imply that the information comes from a verse, text, passage, or scripture.  
The user must NOT feel that the question is based on something they have read.

You ARE allowed to use:
- Any names, events, actions, motivations, teachings, or concepts that appear in the content

You are NOT allowed to use ANY of the following phrasing patterns:
- "according to the shloka"
- "according to the verse"
- "according to the text"
- "as described"
- "as mentioned"
- "in this passage"
- "in the lines"
- "what is stated"
- "who is said to"
- "what happens here"
- "what is described"
- "the shloka says"
- ANY wording that implies the user sees or reads a text

Your questions must be:
- Fully standalone and natural
- Written as general knowledge or conceptual questions
- Using names/events directly, without referencing any verse/source
- Based only on the meaning conveyed
- NOT translations of each other across languages
- Varied in type: factual, conceptual, motivational, cause-effect, philosophical, significance-based, or domain-relevant

Shloka (Sanskrit):
{sanskrit}

Translation (English):
{english}

Task:
Generate a single, distinct question-answer pair for each language:
- English (q_en / a_en)
- Hindi in Devanagari (q_hi / a_hi)
- Sanskrit in Devanagari (q_sa / a_sa)

Rules:
- The question must stand alone as an independent knowledge question.
- You MUST use names and events normally, but NEVER reference or hint that they come from a text.
- The answer must be concise (1-3 sentences) and based ONLY on the provided information.
- No external stories or commentary.

Return ONLY valid JSON with this exact structure and no other text:

{{
  "q_en": ["question"],
  "a_en": ["answer"],
  "q_hi": ["प्रश्न"],
  "a_hi": ["उत्तर"],
  "q_sa": ["प्रश्न"],
  "a_sa": ["उत्तर"]
}}
"""

def build_prompt(sanskrit: str, english: str) -> str:
    """Build the prompt for the LLM for a single Q&A pair."""
    return PROMPT_TEMPLATE.format(sanskrit=sanskrit.strip(), english=english.strip())

def _repair_incomplete_json(json_str: str) -> Optional[Dict[str, Any]]:
    """Attempt to repair incomplete JSON by adding missing closing brackets"""
    logger.debug(f"Attempting to repair incomplete JSON of length {len(json_str)}")
    
    # Count opening and closing braces to see how unbalanced it is
    open_braces = json_str.count('{') + json_str.count('[')
    close_braces = json_str.count('}') + json_str.count(']')
    
    logger.debug(f"Brace balance - Open: {open_braces}, Close: {close_braces}")
    
    # If significantly unbalanced, try to close it
    if open_braces > close_braces:
        # Add missing closing braces
        missing_braces = open_braces - close_braces
        repaired = json_str + '}' * missing_braces + ']' * (missing_braces // 2)
        
        try:
            parsed = json.loads(repaired)
            if isinstance(parsed, dict):
                logger.info("Successfully repaired incomplete JSON")
                return parsed
        except json.JSONDecodeError as e:
            logger.debug(f"JSON repair failed: {e}")
    
    return None

def _extract_first_json(s: str) -> Optional[str]:
    """Extract the first valid JSON object from a string"""
    if not s:
        logger.debug("Empty string provided for JSON extraction")
        return None
    
    start = s.find('{')
    if start == -1:
        logger.debug("No opening brace found in string")
        return None
    
    depth = 0
    in_string = False
    escape = False
    
    for i in range(start, len(s)):
        c = s[i]
        
        if escape:
            escape = False
            continue
            
        if c == '\\':
            escape = True
            continue
            
        if c == '"' and not escape:
            in_string = not in_string
            continue
            
        if not in_string:
            if c == '{' or c == '[':
                depth += 1
            elif c == '}' or c == ']':
                depth -= 1
                if depth == 0:
                    json_str = s[start:i+1]
                    logger.debug(f"Extracted JSON string of length {len(json_str)}")
                    return json_str
    
    logger.debug("No complete JSON object found, attempting repair")
    return None

def _validate_output(j: Dict[str, Any], n: int):
    """Validate the output structure and content"""
    logger.debug(f"Validating output with required length: {n}")
    
    required = ["q_en", "a_en", "q_hi", "a_hi", "q_sa", "a_sa"]
    for k in required:
        if k not in j:
            raise ValueError(f"Missing key {k} in model output. Keys present: {list(j.keys())}")
        if not isinstance(j[k], list):
            raise ValueError(f"Key {k} must be a list, got {type(j[k])}")
        if len(j[k]) != n:
            # Try to truncate or pad to correct length
            if len(j[k]) > n:
                logger.warning(f"Key {k} has {len(j[k])} items, truncating to {n}")
                j[k] = j[k][:n]
            else:
                logger.warning(f"Key {k} has only {len(j[k])} items, expected {n}")
                # Pad with empty strings
                while len(j[k]) < n:
                    j[k].append("")
    
    logger.info("Output validation successful")

def _try_parse_response(resp_text: str) -> Optional[Dict[str, Any]]:
    """Attempt to parse JSON from various response formats with repair"""
    logger.debug(f"Attempting to parse response text of length: {len(resp_text)}")
    
    if not resp_text or not resp_text.strip():
        logger.warning("Empty response text received")
        return None
    
    # Clean the response - remove any thinking text before JSON
    lines = resp_text.split('\n')
    json_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('{'):
            json_start = i
            break
    
    if json_start is not None:
        cleaned_text = '\n'.join(lines[json_start:])
        logger.debug(f"Cleaned text to start from JSON, new length: {len(cleaned_text)}")
    else:
        cleaned_text = resp_text
    
    # Attempt 1: Direct JSON parse
    try:
        parsed = json.loads(cleaned_text)
        if isinstance(parsed, dict):
            logger.debug("Successfully parsed direct JSON")
            return parsed
    except json.JSONDecodeError as e:
        logger.debug(f"Direct JSON parse failed: {e}")
    
    # Attempt 2: Extract JSON from text
    extracted = _extract_first_json(cleaned_text)
    if extracted:
        try:
            parsed = json.loads(extracted)
            if isinstance(parsed, dict):
                logger.debug("Successfully parsed extracted JSON")
                return parsed
        except json.JSONDecodeError as e:
            logger.debug(f"Extracted JSON parse failed: {e}")
    
    # Attempt 3: Try to repair incomplete JSON
    repaired = _repair_incomplete_json(cleaned_text)
    if repaired:
        return repaired
    
    logger.warning(f"Could not parse JSON from response. First 200 chars: {cleaned_text[:200]}")
    return None

def _check_server_health() -> bool:
    """Check if Ollama server is healthy and model is available"""
    try:
        logger.info(f"Checking Ollama server health at {OLLAMA_URL}")
        
        # Check server connectivity
        tags_response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        if tags_response.status_code != 200:
            logger.error(f"Ollama server returned {tags_response.status_code}")
            return False
        
        available_models = tags_response.json().get('models', [])
        model_names = [m.get('name', '') for m in available_models]
        logger.info(f"Available models: {', '.join(model_names)}")
        
        # Check if our model is available
        target_model = os.getenv("MODEL_NAME", "gpt-oss:120b")
        if not any(target_model in name for name in model_names):
            logger.error(f"Model {target_model} not found in available models")
            return False
        
        logger.info(f"Model {target_model} is available")
        return True
        
    except Exception as e:
        logger.error(f"Server health check failed: {e}")
        return False

def _generate_single_qa(sanskrit: str, english: str, model: str, timeout: float) -> Dict[str, Any]:
    """Generate a single Q&A pair with retries."""
    prompt = build_prompt(sanskrit, english)
    endpoint = f"{OLLAMA_URL}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "temperature": 0.1 + random.random() * 0.4, # Add some variability
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "options": {"num_predict": MAX_OUTPUT_TOKENS}
    }

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(endpoint, json=payload, timeout=timeout)
            resp.raise_for_status()
            parsed = _try_parse_response(resp.json().get('response', ''))
            if parsed:
                _validate_output(parsed, n=1)
                return parsed
            else:
                raise ValueError("Failed to parse valid JSON from model response")
        except Exception as e:
            last_err = e
            logger.warning(f"Single generation attempt {attempt} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF * (2 ** (attempt - 1)))
            continue
    raise last_err if last_err else RuntimeError("Single generation failed")

def generate_for_row(sanskrit: str, english: str, model: str = "gpt-oss:120b", n: int = 4, timeout: Optional[float] = None) -> Dict[str, Any]:
    """Generate Q&A pairs in parallel for a given shloka."""
    logger.info(f"Starting parallel generation for {n} Q&A pairs.")
    if not _check_server_health():
        raise RuntimeError("Ollama server is not available or model not found")

    used_timeout = timeout if timeout is not None else GEN_TIMEOUT
    results = {
        "q_en": [], "a_en": [],
        "q_hi": [], "a_hi": [],
        "q_sa": [], "a_sa": []
    }
    
    with ThreadPoolExecutor(max_workers=n) as executor:
        futures = [executor.submit(_generate_single_qa, sanskrit, english, model, used_timeout) for _ in range(n)]

        for future in as_completed(futures):
            try:
                result = future.result()
                for key in results.keys():
                    results[key].extend(result[key])
            except Exception as e:
                logger.error(f"A generation task failed: {e}")
                # Even if some fail, we try to return a partial result
                continue
    
    # Final validation to ensure correct number of pairs, pad if necessary
    _validate_output(results, n)
    logger.info(f"Successfully generated {len(results['q_en'])}/{n} Q&A pairs in parallel.")
    return results