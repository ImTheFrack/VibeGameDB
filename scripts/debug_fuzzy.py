#!/usr/bin/env python3
"""Debug fuzzy matching to see what's happening."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from handlers.database_handler import _normalize_name, _fuzzy_match_score, _fuzzy_match_words

# Test the specific cases that aren't working
test_cases = [
    ("Eldn", "Elden Ring"),
    ("rign", "Elden Ring"),
    ("Holow", "Hollow Knight"),
]

print("=" * 70)
print("DEBUG: Character-level Fuzzy Matching")
print("=" * 70)

for query, target in test_cases:
    norm_query = _normalize_name(query)
    norm_target = _normalize_name(target)
    
    print(f"\nQuery: '{query}' -> '{norm_query}'")
    print(f"Target: '{target}' -> '{norm_target}'")
    
    # Try full string match
    score = _fuzzy_match_score(norm_query, norm_target, threshold=0.6)
    print(f"Full string match: {score}")
    
    # Try matching against individual words
    target_words = norm_target.split()
    print(f"Target words: {target_words}")
    
    for tword in target_words:
        word_score = _fuzzy_match_score(norm_query, tword, threshold=0.6)
        print(f"  '{norm_query}' vs '{tword}': {word_score}")
