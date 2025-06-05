// Test fixtures for development and testing
// Provides realistic sample data to avoid hitting real APIs

export const TEST_PROJECTS = {
  realProject: {
    repoUrl: 'https://github.com/user/awesome-app',
    demoUrl: 'https://awesome-app.vercel.app',
    readmeUrl: 'https://raw.githubusercontent.com/user/awesome-app/main/README.md',
    expectedDecision: 'true',
    expectedReason: 'Live demo is a real project with full functionality'
  },
  
  templateProject: {
    repoUrl: 'https://github.com/user/template-app', 
    demoUrl: 'https://template-app.netlify.app',
    readmeUrl: 'https://raw.githubusercontent.com/user/template-app/main/README.md',
    expectedDecision: 'false',
    expectedReason: 'README appears to be a generic template'
  },
  
  demoOnly: {
    repoUrl: 'https://github.com/user/proof-of-concept',
    demoUrl: 'https://poc-demo.herokuapp.com',
    readmeUrl: 'https://raw.githubusercontent.com/user/proof-of-concept/main/README.md',
    expectedDecision: 'false', 
    expectedReason: 'Link is a demo, not a shipped project'
  },
  
  videoDemo: {
    repoUrl: 'https://github.com/user/video-project',
    demoUrl: 'https://www.youtube.com/watch?v=demoVideo123',
    readmeUrl: 'https://raw.githubusercontent.com/user/video-project/main/README.md',
    expectedDecision: 'true',
    expectedReason: 'Live demo is a video'
  },
  
  brokenDemo: {
    repoUrl: 'https://github.com/user/broken-links',
    demoUrl: 'https://broken-link-404.com',
    readmeUrl: 'https://raw.githubusercontent.com/user/broken-links/main/README.md',
    expectedDecision: 'false',
    expectedReason: 'Live demo is not working: NOT_WORKING: Link returns 404'
  }
}

export const SAMPLE_READMES = {
  specific: `# Awesome Task Manager

A powerful task management application built with React and Node.js.

## Features
- Real-time collaboration
- Advanced filtering and sorting
- Custom project templates
- Integration with Slack and Discord
- Mobile-responsive design

## Installation
\`\`\`bash
npm install
npm start
\`\`\`

## API Documentation
The REST API provides endpoints for managing tasks, projects, and users.

## Deployment
Deployed on AWS with automatic scaling.`,

  templated: `# Project Title

One Paragraph of project description goes here

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

What things you need to install the software

### Installing

A step by step series of examples

## Running the tests

Explain how to run the automated tests

## Deployment

Add additional notes about how to deploy this on a live system

## Built With

## Contributing

## Versioning

## Authors

## License`,

  aiGenerated: `# Revolutionary AI-Powered Project

This cutting-edge application leverages the power of artificial intelligence to deliver unprecedented user experiences. Our innovative solution combines machine learning algorithms with intuitive design to create a seamless workflow that will transform how you work.

## Key Features
✨ AI-driven recommendations
🚀 Lightning-fast performance  
📊 Advanced analytics dashboard
🔒 Enterprise-grade security
🌟 Intuitive user interface

## Technology Stack
- React.js for modern frontend
- Node.js for robust backend
- MongoDB for scalable database
- AWS for cloud infrastructure

This project represents the future of productivity tools, designed with the user in mind and powered by the latest advances in artificial intelligence.`
}

// Mock browser automation responses
export const BROWSER_RESPONSES = {
  workingDemo: 'DEMO_LINK: Interactive web application with login functionality and real-time updates',
  videoDemo: 'VIDEO_LINK: YouTube demonstration showing complete workflow from start to finish',
  brokenDemo: 'NOT_WORKING: Connection timeout after 30 seconds',
  loginRequired: 'NOT_WORKING: Site requires authentication to access main features'
}

// Helper function to get test data for a specific project type
export function getTestProject(type) {
  if (!TEST_PROJECTS[type]) {
    throw new Error(`Unknown test project type: ${type}`)
  }
  return TEST_PROJECTS[type]
}

// Helper function to simulate API delays in development
export async function simulateDelay(ms = 500) {
  if (process.env.NODE_ENV === 'development' || process.env.SIMULATE_DELAYS === 'true') {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}
