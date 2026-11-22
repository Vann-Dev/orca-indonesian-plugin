// Product, protocol and vendor names that stay as they are in Indonesian copy.
export const NAMES = [
  'Orca', 'GitHub', 'GitLab', 'Gitea', 'Bitbucket', 'Claude', 'Codex', 'OpenCode',
  'Cursor', 'Linear', 'Jira', 'Slack', 'Figma', 'Notion', 'Vercel', 'Docker',
  'Composio', 'ChatGPT', 'OpenAI', 'Anthropic', 'Gemini', 'Antigravity', 'Grok',
  'Kimi', 'MiniMax', 'Muse', 'Copilot', 'Zed', 'Warp', 'PowerShell', 'macOS',
  'Windows', 'Linux', 'WSL', 'Homebrew', 'MCP', 'LSP', 'CLI', 'API', 'SDK', 'SSH',
  'HTTP', 'HTTPS', 'JSON', 'YAML', 'TOML', 'SQLite', 'CSV', 'HTML', 'CSS',
  'JavaScript', 'TypeScript', 'Python', 'Rust', 'Kotlin', 'Android', 'iOS',
  'APK', 'IDE', 'REST', 'ANSI', 'OSC', 'Xcode', 'MacBook', 'Git', 'Bash',
  'Qoder', 'Kilo', 'Devin', 'Windsurf', 'Trae', 'Auggie', 'Kiro', 'Amp', 'Droid',
  'Hermes', 'Gremlin', 'Claudino', 'Nautilus', 'Electron', 'Chrome', 'Nautilus'
]

export const NAMES_RE = new RegExp(`\\b(${NAMES.join('|')})\\b`, 'g')
