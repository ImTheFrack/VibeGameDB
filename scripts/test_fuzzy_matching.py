#!/usr/bin/env python3
"""
Test script for fuzzy matching improvements.

Tests the new fuzzy matching logic against various typo scenarios.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from handlers.database_handler import _normalize_name, _fuzzy_match_score, _fuzzy_match_words

def test_fuzzy_matching():
    """Test various fuzzy matching scenarios."""
    
    print("=" * 70)
    print("FUZZY MATCHING TEST SUITE")
    print("=" * 70)
    
    # Test cases: (query, target, expected_match)
    test_cases = [
        # Character-level fuzzy (typos in single word)
        ("Eldn", "Elden", True, "Single word typo: missing 'e'"),
        ("rign", "Ring", True, "Single word typo: missing 'i'"),
        ("Eldenring", "Elden Ring", True, "Missing space"),
        ("Elden Rign", "Elden Ring", True, "Typo in second word"),
        
        # Word-level fuzzy (multiple words with typos)
        ("Eldn rign", "Elden Ring", True, "Typos in both words"),
        ("Elden Ringer", "Elden Ring", True, "Extra letter in second word"),
        
        # Should still work (existing functionality)
        ("Elden", "Elden Ring", True, "Exact word match"),
        ("Elden Ring", "Elden Ring", True, "Exact phrase match"),
        ("Elden", "Elden", True, "Exact single word"),
        
        # Edge cases
        ("xyz", "Elden Ring", False, "No match"),
        ("", "Elden Ring", False, "Empty query"),
    ]
    
    print("\n1. CHARACTER-LEVEL FUZZY MATCHING (difflib.SequenceMatcher)")
    print("-" * 70)
    
    for query, target, should_match, description in test_cases:
        if not query:
            print(f"  ✓ SKIP: {description} (empty query)")
            continue
        
        norm_query = _normalize_name(query)
        norm_target = _normalize_name(target)
        score = _fuzzy_match_score(norm_query, norm_target, threshold=0.6)
        matched = score is not None
        
        status = "✓" if matched == should_match else "✗"
        score_str = f"{score:.2f}" if score else "None"
        print(f"  {status} {description}")
        print(f"     Query: '{query}' -> '{norm_query}'")
        print(f"     Target: '{target}' -> '{norm_target}'")
        print(f"     Score: {score_str}, Matched: {matched}, Expected: {should_match}")
        print()
    
    print("\n2. WORD-LEVEL FUZZY MATCHING (multiple words with typos)")
    print("-" * 70)
    
    word_test_cases = [
        (["Eldn", "rign"], "Elden Ring", True, "Both words with typos"),
        (["Elden", "Ringer"], "Elden Ring", True, "Second word with extra letter"),
        (["Elden", "Ring"], "Elden Ring", True, "Exact words"),
        (["xyz", "abc"], "Elden Ring", False, "No matching words"),
    ]
    
    for query_words, target, should_match, description in word_test_cases:
        norm_target = _normalize_name(target)
        score = _fuzzy_match_words(query_words, norm_target, threshold=0.6)
        matched = score is not None
        
        status = "✓" if matched == should_match else "✗"
        score_str = f"{score:.2f}" if score else "None"
        print(f"  {status} {description}")
        print(f"     Query words: {query_words}")
        print(f"     Target: '{target}' -> '{norm_target}'")
        print(f"     Score: {score_str}, Matched: {matched}, Expected: {should_match}")
        print()
    
    print("\n3. NORMALIZATION TEST")
    print("-" * 70)
    
    norm_tests = [
        ("Elden Ring", "elden ring"),
        ("The Legend of Zelda", "legend of zelda"),
        ("L'Oréal", "loreal"),
        ("Pokémon: Scarlet & Violet", "pokemon scarlet violet"),
    ]
    
    for original, expected in norm_tests:
        result = _normalize_name(original)
        status = "✓" if result == expected else "✗"
        print(f"  {status} '{original}' -> '{result}' (expected: '{expected}')")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)

if __name__ == '__main__':
    test_fuzzy_matching()
