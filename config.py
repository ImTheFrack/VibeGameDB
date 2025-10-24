"""
Central configuration for the Video Game Database application.

This file centralizes values that may change between environments, such as
AI endpoints, database file paths, and application metadata.

Follow the provided template: AI agents are defined in a dictionary that can
be used by a single generic AI request function implemented later.
"""

# --- AI Configuration ---
# Configure the OpenAI-compatible endpoint (or other provider) here. Using a
# host in config makes it easy to swap providers or add local proxies.
AI_ENDPOINT_URL = "http://gandalf.home.arpa:3000"

# Defines different 'agents' for specific tasks. These templates provide the
# model name and a base prompt to ensure consistent behavior across calls.
AI_AGENTS = {
    "researcher": {
        "model": "mistral-7b-instruct",
        "base_prompt": "You are a helpful research assistant specializing in video games. Your goal is to find accurate information about games and platforms.",
    },
    "reviewer": {
        "model": "gpt-4-code-reviewer",
        "base_prompt": "You are an expert code reviewer. Please analyze the following code for quality, clarity, and adherence to project standards.",
    }
}

# --- IGDB API Configuration ---
# Credentials for authenticating with the Twitch/IGDB API.
# You can generate these from the Twitch Developer Console.
IGDB_CLIENT_ID = "epl48quhzq3fcvamrk27jngq0idutx"
IGDB_CLIENT_SECRET = "iplgi5j3awi6hkl4nzq3yf2ywverah"
IGDB_AUTH_URL = "https://id.twitch.tv/oauth2/token"
IGDB_API_URL = "https://api.igdb.com/v4"


# --- Database Configuration ---
# This points to the SQLite file we will use later. Keeping it in config avoids
# scattering file paths across modules.
DATABASE_FILE = "data/gamedb.sqlite"


# --- Application Settings ---
APP_TITLE = "My Game Library"
# Platform filter behavior: when True, multiple selected platforms require a
# game to be present on ALL selected platforms (AND). When False, selecting
# multiple platforms will show games that are present on ANY selected
# platforms (OR). This can be overridden later via a user setting.
PLATFORM_FILTER_AND = True
