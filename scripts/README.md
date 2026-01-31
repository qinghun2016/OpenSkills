# OpenSkills Scripts

Scripts for OpenSkills project initialization, verification, and proposal submission.

## Environment Variables

Scripts use the following environment variables (with defaults when not set):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSKILLS_API_URL` | `http://localhost:3847` | OpenSkills API base URL. Plugin mode defaults to 3847; npm `dev:api` uses `PORT` (default 3000). |
| `API_BASE` | (derived from `OPENSKILLS_API_URL` + `/api`) | Full API endpoint base. Used by `verify-flow.ts`; others use `OPENSKILLS_API_URL` directly. |
| `WORKSPACE` | `process.cwd()` | Workspace root for flow verification and skill path resolution. |
| `WORKSPACE_ROOT` | (optional) | Overrides workspace root in API and some scripts. |

## Scripts

### post-experience-proposals.js

Submits proposals for experience extraction and agent-fix rules.

- Requires: Running API (`npm run dev:api` or plugin embedded server)
- Uses: `OPENSKILLS_API_URL` (default `http://localhost:3847`)

### verify-flow.ts

End-to-end validation: Proposal → Decision → Apply → Rollback.

- Requires: Running API
- Uses: `API_BASE` or `OPENSKILLS_API_URL` (with `/api` suffix), `WORKSPACE`

```bash
# Default: API at localhost:3847, workspace = cwd
npx ts-node scripts/verify-flow.ts

# Custom API and workspace
OPENSKILLS_API_URL=http://localhost:3000 WORKSPACE=/path/to/project npx ts-node scripts/verify-flow.ts
```

### propose-stdin.js

Creates an OpenSkills proposal by reading the request body JSON from **stdin** (no file write). Use this when you must POST a proposal without writing any `.json` file (writing a file triggers Cursor confirmation and blocks the task).

- Requires: Running API
- Uses: `OPENSKILLS_API_URL` (default `http://localhost:3847`)

```bash
# Pipe JSON from a command (no file)
node -e "console.log(JSON.stringify({skillName:'x',scope:'project',reason:'...',diff:'...',trigger:'agent',proposerMeta:{source:'agent',name:'...',createdAt:new Date().toISOString()}}))" | node scripts/propose-stdin.js
```

### create-proposal-agent-startup.js

Creates a proposal for agent-startup rule updates (reads diff from `tmp-agent-startup.diff`).

- Requires: Running API
- Uses: `OPENSKILLS_API_URL` (default `http://localhost:3847`)

### init-project.ts

Initializes OpenSkills directory structure in a target project.

- Uses: Target path as first argument, or `process.cwd()` if omitted

```bash
npx ts-node scripts/init-project.ts [target-path]
```

## Port Reference

- **Plugin mode**: API 3847, Web 3848
- **npm `dev:api`**: API uses `PORT` (default 3000)
- **npm `dev:web`**: Web uses `VITE_PORT` (default 3848)

When running scripts against a plugin-started API, use `OPENSKILLS_API_URL=http://localhost:3847` (or leave unset). When using npm-started API, use `OPENSKILLS_API_URL=http://localhost:3000` or set `PORT=3847` before starting the API.
