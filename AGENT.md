# Agent Development Guide

## Commands

### Build/Run/Test
- Start application: `./start.sh` or `bun run mole-nexus/index.js`
- Start worker: `cd mole-worker && bun run worker.js`
- Build worker docker: `cd mole-worker && docker build -t mole-worker .`
- Test worker docker: `docker run --rm --env-file .env mole-worker "prompt here"`
- Install deps (server): `cd mole-server && bun install`
- Install deps (worker): `cd mole-worker && uv pip install -r requirements.txt`

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
