// Configuration management for different environments
// Allows switching between real AI APIs and mocks

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Auto-load .env if it exists
const envPath = join(__dirname, '../.env')
if (existsSync(envPath)) {
  const envFile = await Bun.file(envPath).text()
  for (const line of envFile.split('\n')) {
    if (line.includes('=')) {
      const [key, value] = line.split('=', 2)
      process.env[key] = value
    }
  }
  console.log('✅ Loaded environment variables from .env')
} else {
  console.log('⚠️  No .env file found at project root')
}

// Environment configuration
export const CONFIG = {
  // AI Provider Settings
  AI_PROVIDER: process.env.AI_PROVIDER || 'mock', // 'gemini', 'anthropic', 'mock', 'ollama'
  
  // API Keys
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  
  // Local AI Settings  
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.1',
  
  // Development Settings
  MOCK_AI_DELAY: parseInt(process.env.MOCK_AI_DELAY) || 100,
  ENABLE_BROWSER_USE: process.env.ENABLE_BROWSER_USE !== 'false',
  
  // Rate Limiting
  MAX_CONCURRENT_CALLS: parseInt(process.env.MAX_CONCURRENT_CALLS) || 2,
  RATE_LIMIT_DELAY: parseInt(process.env.RATE_LIMIT_DELAY) || 1000,
  
  // Testing
  USE_TEST_FIXTURES: process.env.NODE_ENV === 'test' || process.env.USE_TEST_FIXTURES === 'true'
}

// Validate configuration
export function validateConfig() {
  const errors = []
  
  if (CONFIG.AI_PROVIDER === 'gemini' && !CONFIG.GEMINI_API_KEY) {
    errors.push('GEMINI_API_KEY required when AI_PROVIDER=gemini')
  }
  
  if (CONFIG.AI_PROVIDER === 'anthropic' && !CONFIG.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY required when AI_PROVIDER=anthropic')
  }
  
  if (CONFIG.AI_PROVIDER === 'ollama' && !CONFIG.OLLAMA_BASE_URL) {
    errors.push('OLLAMA_BASE_URL required when AI_PROVIDER=ollama')
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration errors:')
    errors.forEach(error => console.error(`  - ${error}`))
    process.exit(1)
  }
  
  console.log(`✅ Using AI provider: ${CONFIG.AI_PROVIDER}`)
  return true
}

// Helper to check if we're in development mode
export function isDevelopment() {
  return process.env.NODE_ENV === 'development' || CONFIG.AI_PROVIDER === 'mock'
}

// Helper to check if we should use real APIs
export function useRealAPIs() {
  return CONFIG.AI_PROVIDER !== 'mock' && !CONFIG.USE_TEST_FIXTURES
}
