# PapyrusAI Service Documentation

PapyrusAI provides learning APIs for lessons, AI-generated content, and study tracking.

## Discovery

- API catalog: `/.well-known/api-catalog`
- OpenID discovery: `/.well-known/openid-configuration`
- OAuth AS metadata: `/.well-known/oauth-authorization-server`
- OAuth protected resource metadata: `/.well-known/oauth-protected-resource`
- Agent skills index: `/.well-known/agent-skills/index.json`
- MCP server card: `/.well-known/mcp/server-card.json`

## Main APIs

- `POST /api/auth/login`
- `GET /api/lessons`
- `GET /api/user-lessons`
- `POST /api/ai-generations/trigger`
