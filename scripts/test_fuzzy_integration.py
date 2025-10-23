#!/usr/bin/env python3
"""
Integration test for fuzzy matching with actual database.

Creates a test database with sample games and tests fuzzy search.
"""

import sys
import os
import tempfile
import sqlite3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from handlers.database_handler import (
    _get_conn, _ensure_schema, _create_game, _autocomplete,
    _create_platform, _create_game_platform
)

def setup_test_db():
    """Create a temporary test database with sample games."""
    # Create temp database
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.sqlite')
    db_path = temp_db.name
    temp_db.close()
    
    conn = _get_conn(db_path)
    _ensure_schema(conn)
    
    # Add test games
    test_games = [
        {'name': 'Elden Ring', 'description': 'Action RPG by FromSoftware'},
        {'name': 'The Legend of Zelda: Breath of the Wild', 'description': 'Open-world adventure'},
        {'name': 'Dark Souls III', 'description': 'Challenging action RPG'},
        {'name': 'Hollow Knight', 'description': 'Metroidvania platformer'},
        {'name': 'Stardew Valley', 'description': 'Farming simulation'},
    ]
    
    for game_data in test_games:
        _create_game(conn, game_data)
    
    conn.close()
    return db_path

def test_fuzzy_autocomplete():
    """Test fuzzy autocomplete with various queries."""
    db_path = setup_test_db()
    
    try:
        print("=" * 70)
        print("FUZZY MATCHING INTEGRATION TEST")
        print("=" * 70)
        print(f"\nTest database: {db_path}")
        
        # Test queries
        test_queries = [
            ("Elden", "Exact word match"),
            ("Eldn", "Character-level typo (missing 'e')"),
            ("Elden Rign", "Typo in second word"),
            ("rign", "Single word typo"),
            ("Eldenring", "Missing space"),
            ("Zelda", "Exact word from multi-word title"),
            ("Zeld", "Typo in 'Zelda'"),
            ("Dark Souls", "Multi-word exact match"),
            ("Drak Souls", "Typo in multi-word"),
            ("Hollow", "Exact word from title"),
            ("Holow", "Typo in 'Hollow'"),
            ("Stardew", "Exact word"),
            ("Stardw", "Typo in 'Stardew'"),
            ("xyz", "No match"),
        ]
        
        conn = _get_conn(db_path)
        _ensure_schema(conn)
        
        for query, description in test_queries:
            result = _autocomplete(conn, {'q': [query]}, limit=5)
            suggestions = result.get('suggestions', [])
            
            print(f"\n{'─' * 70}")
            print(f"Query: '{query}' ({description})")
            print(f"Results: {len(suggestions)} match(es)")
            
            if len(suggestions) == 0:
                print("  (No matches found)")
            
            for i, sugg in enumerate(suggestions, 1):
                match_type = sugg.get('match_type', 'unknown')
                score = sugg.get('score', 'N/A')
                score_str = f"{score:.2f}" if isinstance(score, float) else score
                print(f"  {i}. {sugg['name']} [{match_type}, score: {score_str}]")
        
        conn.close()
        
        print(f"\n{'=' * 70}")
        print("INTEGRATION TEST COMPLETE")
        print("=" * 70)
        
    finally:
        # Clean up
        if os.path.exists(db_path):
            os.remove(db_path)

if __name__ == '__main__':
    test_fuzzy_autocomplete()
