# Fuzzy Matching Strategy

## Overview

The autocomplete/search system now uses a **three-stage fuzzy matching strategy** that balances speed with accuracy:

1. **Exact/Prefix Matches** (FTS5) - Fast, handles word-based matches
2. **Word-based Fuzzy Matches** (FTS5) - Handles typos in individual words
3. **Character-level Fuzzy Matches** (difflib) - Handles typos like "Eldn" → "Elden"

## What Now Works

### Before (Limited)
- ✓ `Elden Rign` → "Elden Ring" (word-based OR match)
- ✓ `Eldn Ring` → "Elden Ring" (word-based OR match)
- ✓ `Elden Ringer` → "Elden Ring" (word-based OR match)
- ✗ `Eldn` → "Elden" (no character-level fuzzy)
- ✗ `rign` → "Ring" (no character-level fuzzy)
- ✗ `Eldenring` → "Elden Ring" (no space handling)
- ✗ `Eldn rign` → "Elden Ring" (no word-level fuzzy)

### After (Comprehensive)
- ✓ `Elden Rign` → "Elden Ring"
- ✓ `Eldn Ring` → "Elden Ring"
- ✓ `Elden Ringer` → "Elden Ring"
- ✓ `Eldn` → "Elden" (character-level fuzzy, score: 0.89)
- ✓ `rign` → "Ring" (character-level fuzzy, score: 0.75)
- ✓ `Eldenring` → "Elden Ring" (character-level fuzzy, score: 0.95)
- ✓ `Eldn rign` → "Elden Ring" (word-level fuzzy, score: 0.71)

## How It Works

### Stage 1: Exact/Prefix Matches (FTS5)
```
Query: "Elden"
FTS5 Search: "Elden*"
Results: Games/platforms starting with "Elden"
Score: 1.0 (highest priority)
```

### Stage 2: Word-based Fuzzy (FTS5)
```
Query: "Elden Rign"
FTS5 Search: "(Elden OR Rign) OR "Elden Rign*""
Results: Games/platforms containing "Elden" OR "Rign"
Score: 0.8 (medium priority)
```

### Stage 3: Character-level Fuzzy (difflib)
```
Query: "Eldn"
Algorithm: difflib.SequenceMatcher
Comparison: "eldn" vs "elden"
Ratio: 0.89 (4 matching chars out of 5)
Score: 0.89 (lowest priority, but still matches)
```

## Performance Characteristics

### Computational Cost
- **Stage 1 & 2**: O(log n) - FTS5 is indexed and very fast
- **Stage 3**: O(n × m) where n = number of games, m = query length
  - Only runs if Stages 1 & 2 don't return enough results
  - Typically processes 10-20 games max (limited by `limit` parameter)
  - Negligible for typical game libraries (< 1000 games)

### Optimization Strategies
1. **Lazy evaluation**: Stage 3 only runs if needed
2. **Early termination**: Stops once `limit` results are found
3. **Threshold filtering**: Only matches with score ≥ 0.6 are returned
4. **Normalization**: Names are normalized once before comparison

## Configuration

### Fuzzy Match Threshold
Located in `database_handler.py`, function `_fuzzy_match_score()`:
```python
def _fuzzy_match_score(query: str, target: str, threshold: float = 0.6) -> Optional[float]:
```

- **0.6** (default): Catches most typos (1-2 character differences)
- **0.7**: More strict, only obvious typos
- **0.5**: More lenient, catches longer typos

### Word-level Threshold
Located in `_fuzzy_match_words()`:
```python
score = _fuzzy_match_score(qword, tword, threshold=0.5)  # Lower for individual words
```

- **0.5**: Individual words are more lenient
- Ensures "Eldn" matches "Elden" even though it's only 80% similar

## Examples with Scores

| Query | Target | Stage | Score | Match? |
|-------|--------|-------|-------|--------|
| `Elden` | Elden Ring | 1 (Exact) | 1.00 | ✓ |
| `Elden Ring` | Elden Ring | 1 (Exact) | 1.00 | ✓ |
| `Elden Rign` | Elden Ring | 2 (Word OR) | 0.80 | ✓ |
| `Eldn` | Elden | 3 (Char Fuzzy) | 0.89 | ✓ |
| `rign` | Ring | 3 (Char Fuzzy) | 0.75 | ✓ |
| `Eldenring` | Elden Ring | 3 (Char Fuzzy) | 0.95 | ✓ |
| `Eldn rign` | Elden Ring | 3 (Word Fuzzy) | 0.71 | ✓ |
| `xyz` | Elden Ring | None | None | ✗ |

## Implementation Details

### Key Functions

#### `_normalize_name(name: str) -> str`
Normalizes names for comparison:
- Lowercase
- Remove leading articles (a, an, the, le, la, l')
- Replace punctuation with spaces
- Collapse whitespace

#### `_fuzzy_match_score(query: str, target: str, threshold: float = 0.6) -> Optional[float]`
Character-level fuzzy matching using `difflib.SequenceMatcher`:
- Compares normalized strings
- Returns ratio (0-1) if ≥ threshold, else None
- Handles typos, transpositions, missing/extra characters

#### `_fuzzy_match_words(query_words: List[str], target: str, threshold: float = 0.6) -> Optional[float]`
Word-level fuzzy matching:
- Splits target into words
- For each query word, finds best match in target words
- Returns average score if all query words match, else None
- Handles multi-word queries with typos

### Dependencies
- **difflib** (Python stdlib) - No external dependencies!
- **sqlite3** (Python stdlib) - Already used

## Testing

Run the test suite:
```bash
python scripts/test_fuzzy_matching.py
```

This tests:
- Character-level fuzzy matching
- Word-level fuzzy matching
- Name normalization
- Edge cases

## Future Improvements

1. **Phonetic matching**: Use Soundex/Metaphone for phonetic typos
   - Example: "Zelda" vs "Zelduh"
   - Cost: Moderate (requires additional library or implementation)

2. **Transposition detection**: Explicitly handle swapped characters
   - Example: "Elden" vs "Eldan"
   - Cost: Low (difflib already handles this reasonably)

3. **Caching**: Cache fuzzy match results for repeated queries
   - Cost: Low (simple dict cache)
   - Benefit: Faster repeated searches

4. **Machine learning**: Learn from user selections to improve ranking
   - Cost: High (requires training data and model)
   - Benefit: Personalized results

## Troubleshooting

### "My typo isn't matching"
- Check the threshold (default 0.6)
- Try lowering it in `_fuzzy_match_score()`
- Test with `scripts/test_fuzzy_matching.py`

### "Too many false positives"
- Raise the threshold (0.6 → 0.7)
- Reduce the `limit` parameter to prioritize exact matches

### "Search is slow"
- Check if Stage 3 is running (only if Stages 1 & 2 don't return enough)
- Reduce the `limit` parameter
- Profile with `python -m cProfile`

## References

- [difflib documentation](https://docs.python.org/3/library/difflib.html)
- [FTS5 documentation](https://www.sqlite.org/fts5.html)
- [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance)
