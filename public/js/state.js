// Centralized application state
export const state = {
  allGames: [],
  allPlatforms: [],
  allGamePlatforms: [],
  allTags: [],
  currentTab: 'games',
  currentGameId: null,
  platformFilterAnd: null, // server-configured default; can be overridden per-session
  displayOptions: {
    show_cover: true,
    show_title: true,
    show_description: true,
    show_tags: true,
    show_platforms: true
  },
  currentFilters: {
    keyword: '',
    platforms: [],
    tags: []
  }
};