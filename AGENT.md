# Agent Development Guide

## Commands

### Build/Run/Test

#### Quick Setup
- Setup for development: `./scripts/setup-dev.sh`
- Test worker with mocks: `./scripts/test-worker.sh`
- Start nexus with monitoring: `cd mole-nexus && bun run index.js` (Dashboard at http://localhost:3001)

#### Manual Commands
- Start application: `./start.sh` or `bun run mole-nexus/index.js`
- Start worker: `cd mole-worker && bun run worker.js`
- Build worker docker: `cd mole-worker && docker build -t mole-worker .`
- Test worker docker: `docker run --rm --env-file .env mole-worker "prompt here"`
- Install deps (server): `cd mole-nexus && bun install`
- Install deps (worker): `cd mole-worker && bun install && uv pip install -r requirements.txt`

#### Monitoring
- Web dashboard: http://localhost:3001 (when nexus is running)
- Status API: http://localhost:3001/api/status
- Shows: active workers, queued jobs, processed count, worker details
- Auto-refreshes every 2 seconds

#### Development Modes
- Mock mode (no API costs): Set `AI_PROVIDER=mock` in .env
- Local AI with Ollama: `docker-compose --profile ollama up -d`
- Real AI APIs: Set `AI_PROVIDER=gemini` and add API keys to .env

## Code Style Guidelines

### JavaScript/Node.js (mole-server)
- Use `require()` for imports (CommonJS)
- No semicolons
- Use `async/await` for promises
- Descriptive variable names: `checkedReadmeUrl`, `liveDemoResult`
- Early returns for error conditions

### JavaScript/Bun (mole-worker)
- Use ES6 `import` statements
- No semicolons
- Async functions with proper error handling
- Use template literals for string interpolation
- Destructuring for object properties

### Python (browser-use)
- Snake_case for variables and functions
- Standard library imports first, then third-party
- Flask for HTTP endpoints
- Async/await with asyncio for browser automation

## AI Response Standards

All AI prompts must return standardized status codes. Responses can optionally include explanations in the format: `STATUS_CODE: explanation`

### Status Code Enums

#### Repository Inference
- `FOUND: owner/repo` - Valid GitHub repository found
- `NOT_FOUND: reason` - Invalid or inaccessible repository

#### README Classification  
- `TEMPLATED: reason` - Generic template or boilerplate
- `AI_GENERATED: reason` - AI-generated content detected
- `SPECIFIC: reason` - Project-specific content

#### Live Demo Classification
- `DEMO_LINK: description` - Working live demo/application
- `VIDEO_LINK: description` - Video demonstration
- `NOT_WORKING: reason` - Broken or inaccessible link

#### Reality Check
- `REAL: description` - Fully functional application
- `DEMO: reason` - Demo or placeholder only
- `NO_TASK: reason` - Unable to create testing task

#### Video Justification
- `JUSTIFIED: reason` - Video adequately demonstrates functionality
- `NOT_JUSTIFIED: reason` - Video insufficient or inadequate

#### Release Check
- `HAS_RELEASE: description` - Repository has releases/deployments
- `NO_RELEASE: reason` - Repository lacks releases/deployments

## Git Best Practices for Parallel Agents

### Pre-commit Checks
- Always run `git status` before making changes to see current state
- Check for unstaged changes with `git diff` before modifying files
- Verify no merge conflicts exist before starting work

### Staging Changes
- Use `git add path/to/specific/file.js` instead of `git add .` or `git add -A`
- Stage only files you actually modified to avoid conflicts
- Review staged changes with `git diff --cached` before committing

### Atomic Commits
- Make small, focused commits that address one specific change
- Use sentence case commit messages: `Add explaination to output`
- Start with action verbs: `Add`, `Update`, `Fix`, `Remove`, `Rewrite`

### Conflict Prevention
- Pull latest changes with `git pull` before starting work
- Check for concurrent modifications with `git log --oneline -5`
- Use `git stash` to temporarily save work when switching contexts

### Collaboration Safety
- Never force push (`git push --force`) in shared repositories
- Use `git push --force-with-lease` if force push is absolutely necessary
- Check branch status with `git branch -v` before switching branches
