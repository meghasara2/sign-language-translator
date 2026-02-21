"""
Glosser Service
===============
Converts English text to Sign Language gloss notation.

Sign Language Grammar differs from English:
- Topic-Comment structure
- No articles (a, an, the)
- Different word order (often OSV instead of SVO)
- Time markers at beginning

Examples:
- "What is your name?" → "NAME YOU WHAT"
- "I am going to the store" → "STORE I GO"
- "Yesterday I saw a movie" → "YESTERDAY MOVIE I SEE"
"""

import re
import os
from typing import List, Dict, Tuple, Optional
from loguru import logger
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger.warning("google-generativeai not installed. LLM translation disabled.")


class Glosser:
    """
    Converts English sentences to Sign Language gloss.
    
    Uses rule-based approach for simplicity (suitable for limited vocabulary).
    For production, consider a transformer-based sequence-to-sequence model.
    """
    
    # Words to remove (articles, filler words)
    STOP_WORDS = {
        'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'to', 'of', 'it', 'very', 'just', 'really', 'so'
    }
    
    # Word mappings (English → ASL Gloss)
    WORD_MAP = {
        # Pronouns
        'i': 'ME', "i'm": 'ME', 'my': 'MY', 'myself': 'ME',
        'you': 'YOU', "you're": 'YOU', 'your': 'YOUR', 'yourself': 'YOU',
        'he': 'HE', "he's": 'HE', 'him': 'HE', 'his': 'HIS',
        'she': 'SHE', "she's": 'SHE', 'her': 'HER', 'hers': 'HER',
        'we': 'WE', "we're": 'WE', 'us': 'WE', 'our': 'OUR',
        'they': 'THEY', "they're": 'THEY', 'them': 'THEY', 'their': 'THEIR',
        
        # Questions
        'what': 'WHAT', "what's": 'WHAT',
        'where': 'WHERE', "where's": 'WHERE',
        'when': 'WHEN', "when's": 'WHEN',
        'how': 'HOW', "how's": 'HOW',
        'why': 'WHY',
        'who': 'WHO', "who's": 'WHO',
        'which': 'WHICH',
        
        # Common verbs
        'hello': 'HELLO', 'hi': 'HELLO',
        'goodbye': 'GOODBYE', 'bye': 'GOODBYE',
        'thank': 'THANK-YOU', 'thanks': 'THANK-YOU',
        'please': 'PLEASE',
        'sorry': 'SORRY',
        'yes': 'YES', 'yeah': 'YES', 'yep': 'YES',
        'no': 'NO', 'nope': 'NO',
        'help': 'HELP',
        'want': 'WANT', 'wants': 'WANT', 'wanted': 'WANT',
        'need': 'NEED', 'needs': 'NEED', 'needed': 'NEED',
        'like': 'LIKE', 'likes': 'LIKE', 'liked': 'LIKE',
        'love': 'LOVE', 'loves': 'LOVE', 'loved': 'LOVE',
        'go': 'GO', 'goes': 'GO', 'going': 'GO', 'went': 'GO',
        'come': 'COME', 'comes': 'COME', 'coming': 'COME', 'came': 'COME',
        'eat': 'EAT', 'eats': 'EAT', 'eating': 'EAT', 'ate': 'EAT',
        'drink': 'DRINK', 'drinks': 'DRINK', 'drinking': 'DRINK', 'drank': 'DRINK',
        'sleep': 'SLEEP', 'sleeps': 'SLEEP', 'sleeping': 'SLEEP', 'slept': 'SLEEP',
        'work': 'WORK', 'works': 'WORK', 'working': 'WORK', 'worked': 'WORK',
        'learn': 'LEARN', 'learns': 'LEARN', 'learning': 'LEARN', 'learned': 'LEARN',
        'understand': 'UNDERSTAND', 'understands': 'UNDERSTAND',
        'know': 'KNOW', 'knows': 'KNOW', 'knew': 'KNOW',
        'see': 'SEE', 'sees': 'SEE', 'seeing': 'SEE', 'saw': 'SEE',
        'hear': 'HEAR', 'hears': 'HEAR', 'hearing': 'HEAR', 'heard': 'HEAR',
        'feel': 'FEEL', 'feels': 'FEEL', 'feeling': 'FEEL', 'felt': 'FEEL',
        'think': 'THINK', 'thinks': 'THINK', 'thinking': 'THINK', 'thought': 'THINK',
        
        # Nouns
        'name': 'NAME',
        'friend': 'FRIEND', 'friends': 'FRIEND',
        'family': 'FAMILY',
        'mother': 'MOTHER', 'mom': 'MOTHER',
        'father': 'FATHER', 'dad': 'FATHER',
        'home': 'HOME', 'house': 'HOME',
        'school': 'SCHOOL',
        'work': 'WORK', 'job': 'WORK',
        'food': 'FOOD',
        'water': 'WATER',
        'time': 'TIME',
        'day': 'DAY',
        'night': 'NIGHT',
        
        # Adjectives
        'good': 'GOOD',
        'bad': 'BAD',
        'happy': 'HAPPY',
        'sad': 'SAD',
        'big': 'BIG',
        'small': 'SMALL',
        'new': 'NEW',
        'old': 'OLD',
        
        # Time markers
        'today': 'TODAY',
        'yesterday': 'YESTERDAY',
        'tomorrow': 'TOMORROW',
        'now': 'NOW',
        'later': 'LATER',
        'before': 'BEFORE',
        'after': 'AFTER',
    }
    
    # Question patterns (for restructuring)
    QUESTION_PATTERNS = [
        (r"what is your (.+)\?", lambda m: f"{m.group(1).upper()} YOU WHAT"),
        (r"what are you (.+)\?", lambda m: f"YOU {m.group(1).upper()} WHAT"),
        (r"where (.+) you (.+)\?", lambda m: f"YOU {m.group(2).upper()} WHERE"),
        (r"how are you\??", lambda m: "YOU HOW"),
        (r"how (.+) you\??", lambda m: f"YOU {m.group(1).upper()} HOW"),
    ]
    
    def __init__(self, supported_vocabulary: List[str] = None):
        """
        Initialize glosser.
        
        Args:
            supported_vocabulary: List of supported sign glosses (for filtering)
        """
        self.supported_vocabulary = set(supported_vocabulary) if supported_vocabulary else None
        
        # Initialize Gemini if available
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model = None
        
        if GEMINI_AVAILABLE and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel('gemini-1.5-flash')
                logger.info("Glosser: Gemini 1.5 Flash initialized for intelligent translation")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini: {e}")
        else:
            logger.warning("Glosser: Running in rule-based mode (No GEMINI_API_KEY found)")
            
        logger.info("Glosser initialized")
    
    async def llm_gloss(self, text: str) -> List[str]:
        """Use Gemini to translate English to ASL/ISL Gloss."""
        if not self.model:
            return []
            
        prompt = f"""
        Convert the following English sentence into a simplified Sign Language Gloss sequence (uppercase words, no articles, SVO to OSV where appropriate). 
        
        Input: "{text}"
        
        Return ONLY a comma-separated list of the Gloss words. Example: "NAME YOU WHAT" or "STORE I GO".
        """
        
        try:
            response = self.model.generate_content(prompt)
            if response and response.text:
                # Clean up response (remove punctuation, split by comma or space)
                gloss_text = response.text.upper().replace(',', ' ').strip()
                glosses = [g for g in gloss_text.split() if g]
                logger.info(f"Gemini translated '{text}' -> {glosses}")
                return glosses
        except Exception as e:
            logger.error(f"Gemini translation failed: {e}")
            
        return []

    async def llm_english(self, glosses: List[str]) -> str:
        """Use Gemini to translate ASL/ISL Gloss array to English sentence."""
        if not self.model or not glosses:
            return " ".join(glosses).title() + "."
            
        gloss_str = ", ".join(glosses)
        prompt = f"""
        Convert the following Sign Language Gloss sequence into a natural, grammatically correct English sentence.
        
        Input Gloss: [{gloss_str}]
        
        Return ONLY the final English sentence. Do not add quotes or explanations.
        """
        
        try:
            response = self.model.generate_content(prompt)
            if response and response.text:
                logger.info(f"Gemini reverse translated {glosses} -> '{response.text.strip()}'")
                return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini reverse translation failed: {e}")
            
        return " ".join(glosses).title() + "."

    async def gloss(self, text: str) -> List[str]:
        """
        Convert English text to Sign Language gloss sequence.
        Uses a tiered approach: 1. Rules, 2. LLM (if enabled), 3. Basic Mapping.
        """
        # Lowercase and clean
        original_text = text
        text = text.lower().strip()
        
        # Tier 1: Pattern matching for common structures (fastest)
        for pattern, replacement in self.QUESTION_PATTERNS:
            match = re.match(pattern, text)
            if match:
                result = replacement(match)
                logger.info(f"Rule match: '{original_text}' -> {result}")
                return self._filter_vocabulary(result.split())
        
        # Tier 2: LLM Translation (most intelligent)
        if self.model:
            llm_result = await self.llm_gloss(text)
            if llm_result:
                return self._filter_vocabulary(llm_result)
        
        # Tier 3: Basic Token-based mapping (fallback)
        logger.debug(f"Using fallback mapping for: {text}")
        # Remove punctuation (except apostrophes in contractions)
        text = re.sub(r"[^\w\s']", '', text)
        
        # Tokenize
        words = text.split()
        
        # Extract time markers (move to beginning in ASL)
        time_markers = []
        remaining_words = []
        
        for word in words:
            if word in ['today', 'yesterday', 'tomorrow', 'now', 'later', 'before', 'after']:
                time_markers.append(self.WORD_MAP.get(word, word.upper()))
            else:
                remaining_words.append(word)
        
        # Map words to glosses
        glosses = []
        for word in remaining_words:
            # Skip stop words
            if word in self.STOP_WORDS:
                continue
            
            # Map to gloss
            gloss = self.WORD_MAP.get(word, word.upper())
            glosses.append(gloss)
        
        # Combine: time markers first, then content
        result = time_markers + glosses
        
        # Filter to supported vocabulary
        return self._filter_vocabulary(result)
    
    def _filter_vocabulary(self, glosses: List[str]) -> List[str]:
        """Filter glosses to only include supported vocabulary."""
        if self.supported_vocabulary is None:
            return glosses
        
        filtered = [g for g in glosses if g in self.supported_vocabulary]
        
        if len(filtered) < len(glosses):
            logger.debug(f"Filtered out unsupported glosses: {set(glosses) - set(filtered)}")
        
        return filtered
    
    def get_animations(self, glosses: List[str]) -> List[str]:
        """
        Get animation file paths for gloss sequence.
        
        Args:
            glosses: List of sign glosses
        
        Returns:
            List of animation file paths
        """
        animations = []
        for gloss in glosses:
            # Convert gloss to filename
            filename = gloss.lower().replace('-', '_').replace(' ', '_')
            animations.append(f"{filename}.glb")
        
        return animations


# Singleton instance
_glosser_instance = None

def get_glosser() -> Glosser:
    """Get or create the glosser singleton."""
    global _glosser_instance
    if _glosser_instance is None:
        _glosser_instance = Glosser()
    return _glosser_instance
