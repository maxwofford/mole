# Mole v2 - Simplified Project Analyzer

A streamlined version that classifies projects first, then routes to appropriate testing strategies.

## Key Improvements

- **Early Type Classification**: Determines project type before testing
- **Smart Routing**: Different analysis paths based on project type
- **Human Review Integration**: Automatically flags complex projects for human review
- **Simplified Architecture**: Cleaner, more maintainable codebase

## Project Types

Based on `test-types.yml` specification:

- **Static Website**: Portfolio, docs, marketing sites → Browser feature testing
- **Web App**: Login, databases, user accounts → Full functionality testing  
- **Downloadable Application**: Desktop apps, executables → Human review
- **Mobile App**: iOS/Android apps → Human review
- **Discord Bot**: Discord integrations → Human review
- **Slack Bot**: Slack integrations → Human review

## Quick Start

```bash
# Install dependencies
cd v2
npm install

# Set up environment
export GEMINI_API_KEY="your-key-here"

# Start the server
npm start

# Test a project (CLI)
bun run worker/worker.js https://github.com/user/repo
```

## API

- `POST /api/analyze` - Submit repository for analysis
- `GET /api/status/:jobId` - Check analysis progress  
- `GET /api/results/:jobId` - Get final results

## Architecture

```
v2/
├── nexus/          # Web server & API
│   └── index.js    # Express server with dashboard
├── worker/         # Analysis engine
│   ├── worker.js   # Main analysis logic
│   └── prompts/    # AI prompts for classification
└── package.json    # Dependencies
```

Dashboard available at http://localhost:3002
