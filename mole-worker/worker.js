import { GoogleGenerativeAI } from '@google/generative-ai'
import { Anthropic } from '@anthropic-ai/sdk'
import { MockAI } from './mock-ai.js'
import { CONFIG, validateConfig, isDevelopment, useRealAPIs, getModelName } from './config.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'


// Validate configuration on startup
validateConfig()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)


// Docker worker helper function
async function runWorkerDocker(prompt) {
  try {
    // Ensure GIF directory exists on host
    await Bun.spawn(['mkdir', '-p', '/tmp/agent_history_gifs']).exited;
    
    const proc = Bun.spawn(['docker', 'run', '--rm', 
      '-v', '/tmp/agent_history_gifs:/tmp/agent_history_gifs',
      '-e', `AI_PROVIDER=${CONFIG.AI_PROVIDER}`,
      '-e', `OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`, 
      '-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      '-e', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`,
      '-e', `OLLAMA_BASE_URL=${process.env.OLLAMA_BASE_URL}`,
      '-e', `OLLAMA_MODEL=${process.env.OLLAMA_MODEL}`,
      'mole-worker', prompt], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    
    const exitCode = await proc.exited;
    
    if (exitCode !== 0) {
      console.error('Docker worker error:', error);
      throw new Error(`Docker worker failed with exit code ${exitCode}: ${error}`);
    }

    try {
      // Extract JSON from the end of the output (after all the INFO logs)
      const lines = output.trim().split('\n');
      const jsonLine = lines[lines.length - 1];
      return JSON.parse(jsonLine);
    } catch (parseError) {
      console.error('Failed to parse Docker worker output as JSON:');
      console.error('Raw output:', output);
      console.error('Parse error:', parseError.message);
      throw new Error(`Invalid JSON from Docker worker: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error running docker worker:', error);
    throw error;
  }
}

// Helper function to load and process prompts
async function prompt(name, replacements = {}) {
  const promptPath = join(__dirname, `prompts/${name}.txt`)
  const promptText = await Bun.file(promptPath).text()
  let processed = promptText
  
  for (const [key, value] of Object.entries(replacements)) {
    processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  
  return processed
}

async function inferReadmeUrl(repoUrl) {
  const promptText = await prompt('infer_readme', { url: repoUrl })
  const inferredRepo = await inference(promptText)
  if (inferredRepo.toUpperCase().startsWith('NOT_FOUND')) {
    return null
  }
  
  // Extract repo from "FOUND: owner/repo" format
  let repoName = inferredRepo
  if (inferredRepo.toUpperCase().startsWith('FOUND:')) {
    const repoMatch = inferredRepo.match(/FOUND:\s*(.+)/i)
    if (repoMatch) {
      repoName = repoMatch[1].trim()
    }
  }
  
  console.log('inferred repo', repoName)

  const response = await fetch('https://api.github.com/repos/' + repoName + '/readme')
  const data = await response.json()
  if (response.status !== 200) {
    return null
  }
  console.log('readme data', data)
  return data.download_url
}

async function inferDemoUrl(readmeUrl, repoUrl) {
  try {
    // First, try to get demo URL from GitHub repo metadata if it's a GitHub repo
    if (repoUrl && repoUrl.includes('github.com')) {
      const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (repoMatch) {
        const [, owner, repo] = repoMatch;
        const cleanRepo = repo.replace(/\.git$/, ''); // Remove .git suffix if present
        
        try {
          const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`);
          if (response.ok) {
            const repoData = await response.json();
            console.log('GitHub repo data:', { description: repoData.description, homepage: repoData.homepage });
            
            // Check homepage field first (most likely to be demo URL)
            if (repoData.homepage && repoData.homepage.startsWith('http')) {
              return repoData.homepage;
            }
            
            // Check description for URLs
            if (repoData.description) {
              const urlRegex = /https?:\/\/[^\s)]+/g;
              const urls = repoData.description.match(urlRegex) || [];
              const demoUrls = filterDemoUrls(urls);
              if (demoUrls.length > 0) {
                return demoUrls[0];
              }
            }
          }
        } catch (apiError) {
          console.error('Error fetching GitHub repo data:', apiError);
        }
      }
    }
    
    // Fall back to checking README content
    const readmeText = await fetch(readmeUrl).then(res => res.text())
    
    // Look for common deployment URLs in the README
    const urlRegex = /https?:\/\/[^\s)]+/g
    const urls = readmeText.match(urlRegex) || []
    const demoUrls = filterDemoUrls(urls);
    
    // Return the first likely demo URL found
    return demoUrls.length > 0 ? demoUrls[0] : null
  } catch (error) {
    console.error('Error inferring demo URL:', error)
    return null
  }
}

function filterDemoUrls(urls) {
  // Filter for likely demo URLs (exclude github.com, api.github.com, raw.githubusercontent.com)
  return urls.filter(url => 
    !url.includes('github.com') && 
    !url.includes('githubusercontent.com') &&
    (url.includes('.vercel.app') || 
     url.includes('.netlify.app') || 
     url.includes('.herokuapp.com') ||
     url.includes('.render.com') ||
     url.includes('.railway.app') ||
     url.includes('.fly.dev') ||
     url.includes('.surge.sh') ||
     url.includes('.pages.dev') ||
     url.endsWith('.dev') ||
     url.endsWith('.com') ||
     url.endsWith('.org') ||
     url.endsWith('.io'))
  );
}

async function analyzeHackathonProject(repoUrl='', demoUrl='', readmeUrl='', statusReporter = null) {
  // check all are accessible
  console.log('checking basic check')
  
  if (statusReporter) statusReporter('Checking repository access', 1, 'Inferring README URL from repository');
  
  let checkedReadmeUrl = readmeUrl
  if (!readmeUrl) {
    checkedReadmeUrl = await inferReadmeUrl(repoUrl)
  }
  if (!checkedReadmeUrl) {
    return {
      decision: 'false',
      reason: 'README or repo not found',
      model: getModelName(),
    }
  }
  
  // Try to infer demo URL from README and repo if not provided
  if (statusReporter) statusReporter('Checking demo URL', 2, 'Inferring demo URL from README and repository metadata');
  
  let checkedDemoUrl = demoUrl
  if (!demoUrl) {
    checkedDemoUrl = await inferDemoUrl(checkedReadmeUrl, repoUrl)
  }
  
  console.log({readmeUrl: checkedReadmeUrl, demoUrl: checkedDemoUrl})
  const basicResult = await basicCheck(repoUrl, checkedDemoUrl, checkedReadmeUrl)
  console.log('result:', basicResult)

  if (basicResult == 'failed') {
    return {
      decision: 'false',
      reason: 'Some of the URLs are not accessible',
      model: getModelName(),
    }
  }

  console.log('checking readme check')
  if (statusReporter) statusReporter('Analyzing README', 3, 'Checking if README is templated, AI-generated, or project-specific');
  
  const readmeCheckResult = await readmeCheck(checkedReadmeUrl)
  console.log('result:', readmeCheckResult)
  if (readmeCheckResult.toUpperCase().startsWith('TEMPLATED')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
      model: getModelName(),
    }
  }
  if (readmeCheckResult.toUpperCase().startsWith('AI_GENERATED')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
      model: getModelName(),
    }
  }

  if (!readmeCheckResult.toUpperCase().startsWith('SPECIFIC')) {
    return {
      decision: 'false',
      reason: 'AI inference error on readme check: ' + readmeCheckResult,
      model: getModelName(),
    }
  }
  
  // Skip live demo check if no demoUrl provided
  if (!checkedDemoUrl) {
    return {
      decision: 'false',
      reason: 'No demo URL found or provided',
      model: getModelName(),
    }
  }
  
  console.log('checking live demo check')
  if (statusReporter) statusReporter('Testing live demo', 4, `Opening browser to test: ${checkedDemoUrl}`);
  
  const liveDemoResult = await liveDemoCheck(checkedDemoUrl)
  console.log('result:', liveDemoResult)

  if (liveDemoResult.result.toUpperCase().startsWith('DEMO_LINK')) {
    // return {
    //   decision: 'true',
    //   reason: 'Live demo is working: ' + liveDemoResult,
    // }
    if (statusReporter) statusReporter('Reality check', 5, 'Testing if demo is a real application vs placeholder');
    
    const isRealResult = await isRealCheck(checkedDemoUrl)
    console.log('result:', isRealResult)
    if (isRealResult.result.toUpperCase().startsWith('NO_TASK')) {
      return {
        decision: 'false',
        reason: isRealResult.result,
        model: getModelName(),
        gifPath: isRealResult.gifPath,
      }
    } else if (isRealResult.result.toUpperCase().startsWith('DEMO')) {
      return {
        decision: 'false',
        reason: isRealResult.result,
        model: getModelName(),
        gifPath: isRealResult.gifPath,
      }
    } else if (isRealResult.result.toUpperCase().startsWith('REAL')) {
      return {
        decision: 'true',
        reason: isRealResult.result,
        model: getModelName(),
        gifPath: isRealResult.gifPath,
      }
    } else if (isRealResult.result.toUpperCase().startsWith('HUMAN')) {
      return {
        decision: 'human',
        reason: isRealResult.result,
        model: getModelName(),
        gifPath: isRealResult.gifPath,
      }
    } else {
      return {
        decision: 'false',
        reason: 'AI inference error on live demo check: ' + isRealResult.result,
        model: getModelName(),
        gifPath: isRealResult.gifPath,
      }
    }
  }

  if (liveDemoResult.result.toUpperCase().startsWith('VIDEO_LINK')) {
    console.log('checking video check')
    if (statusReporter) statusReporter('Video validation', 5, 'Checking if video demonstrates project functionality');
    
    const videoResult = await videoCheck(checkedDemoUrl)
    console.log('result:', videoResult)
    if (videoResult == 'success') {
      return {
        decision: 'true',
        reason: 'Live demo is a video',
        model: getModelName(),
      }
    } else if (videoResult == 'failed') {
      console.log('checking repo for release')
      if (statusReporter) statusReporter('Release check', 6, 'Checking repository for deployment releases');
      
      const checkRepoResult = await checkRepoForRelease(repoUrl, checkedReadmeUrl)
      if (checkRepoResult.toUpperCase().startsWith('HAS_RELEASE')) {
        return {
          decision: 'true',
          reason: `Live demo is a video, but the repo has a release. ${checkRepoResult}`,
          model: getModelName(),
        }
      } else if (checkRepoResult.toUpperCase().startsWith('NO_RELEASE')) {
        return {
          decision: 'false',
          reason: `Live demo is a video, but the repo does not have a release. ${checkRepoResult}`,
          model: getModelName(),
        }
      } else {
        return {
          decision: 'false',
          reason: 'Error checking repo for release',
          model: getModelName(),
        }
      }
    } else {
      return {
        decision: 'false',
        reason: 'Error checking video',
        model: getModelName(),
      }
    }
  }


  if (liveDemoResult.result.toUpperCase().startsWith('NOT_WORKING')) {
    return {
      decision: 'false',
      reason: liveDemoResult.result,
      model: getModelName(),
      gifPath: liveDemoResult.gifPath,
    }
  }

  // if result doesn't start with demo link, video link, or not working, it's an inference error
  return {
    decision: 'false',
    reason: 'AI inference error on live demo check: ' + liveDemoResult.result,
    model: getModelName(),
    gifPath: liveDemoResult.gifPath,
  }
}

async function basicCheck(repoUrl, demoUrl, readmeUrl) {
  try {
    const promises = [
      fetch(repoUrl),
      fetch(readmeUrl),
    ]
    
    // Only check demoUrl if it's provided
    if (demoUrl) {
      promises.push(fetch(demoUrl))
    }
    
    const responses = await Promise.all(promises)
    
    // Check if all responses are ok
    for (const response of responses) {
      if (!response.ok) {
        return 'failed'
      }
    }

    return 'success'
  } catch (error) {
    console.error('Error in basicCheck:', error)
    return 'failed'
  }
}

class WorkerRateLimitError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WorkerRateLimitError'
  }
}

class WorkerShutdownError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WorkerShutdownError'
  }
}

// Global AI instance - initialized based on configuration
let aiInstance = null

function getAIInstance() {
  if (!aiInstance) {
    switch (CONFIG.AI_PROVIDER) {
      case 'gemini':
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)
        aiInstance = genAI.getGenerativeModel({ model: getModelName() })
        break
      case 'anthropic':
        aiInstance = new Anthropic({
          apiKey: CONFIG.ANTHROPIC_API_KEY,
        })
        break
      case 'mock':
        aiInstance = new MockAI()
        break
      case 'ollama':
        aiInstance = {
          async generateContent(prompt) {
            const response = await fetch(`${CONFIG.OLLAMA_BASE_URL}/api/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: CONFIG.OLLAMA_MODEL,
                prompt: prompt,
                stream: false
              })
            })
            
            if (!response.ok) {
              throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
            }
            
            const data = await response.json()
            return data.response
          }
        }
        break
      default:
        throw new Error(`Unsupported AI provider: ${CONFIG.AI_PROVIDER}`)
    }
  }
  return aiInstance
}

async function inference(prompt) {
  const ai = getAIInstance()
  
  if (CONFIG.AI_PROVIDER === 'mock') {
    console.log(`[${CONFIG.AI_PROVIDER.toUpperCase()}] Processing prompt...`)
    return await ai.generateContent(prompt)
  }
  
  if (CONFIG.AI_PROVIDER === 'gemini') {
    try {
      const result = await ai.generateContent(prompt)
      const response = await result.response
      const text = response.text()
      
      console.log({prompt, result: text})
      return text
    } catch (error) {
      console.error('Gemini API error:', error)
      
      // Handle rate limiting and quota exceeded
      if (error.status === 429) {
        console.log('Rate limited - throwing WorkerRateLimitError')
        throw new WorkerRateLimitError('Rate limited by Gemini API')
      } else if (error.status === 403) {
        console.log('Quota exceeded - throwing WorkerShutdownError')
        throw new WorkerShutdownError('Gemini API quota exceeded')
      }
      
      // Re-throw other errors
      throw error
    }
  }
  
  if (CONFIG.AI_PROVIDER === 'anthropic') {
    try {
      const result = await ai.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      
      const text = result.content[0].text
      console.log({prompt, result: text})
      return text
    } catch (error) {
      console.error('Anthropic API error:', error)
      
      // Handle rate limiting and quota exceeded
      if (error.status === 429) {
        console.log('Rate limited - throwing WorkerRateLimitError')
        throw new WorkerRateLimitError('Rate limited by Anthropic API')
      } else if (error.status === 403) {
        console.log('Quota exceeded - throwing WorkerShutdownError')
        throw new WorkerShutdownError('Anthropic API quota exceeded')
      }
      
      // Re-throw other errors
      throw error
    }
  }
  
  if (CONFIG.AI_PROVIDER === 'ollama') {
    try {
      const result = await ai.generateContent(prompt)
      console.log({prompt, result})
      return result
    } catch (error) {
      console.error('Ollama API error:', error)
      throw error
    }
  }
  
  throw new Error(`Unsupported AI provider: ${CONFIG.AI_PROVIDER}`)
}

async function readmeCheck(readme) {
  const readmeText = await fetch(readme).then(res => res.text())
  
  const promptText = await prompt('review_readme', { content: readmeText.substring(0, 1000) })
  const result = await inference(promptText)
  return result
}

async function liveDemoCheck(demoUrl) {
  try {
    const promptText = await prompt('live_demo', { url: demoUrl })
    const result = await runWorkerDocker(promptText)

    console.log('worker result', result.result);
    console.log('worker gif path', result.gif);
    
    // Handle empty or invalid responses
    if (!result.result || result.result.trim() === '' || result.result === 'none') {
      return { result: 'NOT_WORKING: Browser automation returned empty result' }
    }
    
    // Return both result and gif path for potential upload
    return {
      result: result.result,
      gifPath: result.gif
    }
  } catch (error) {
    console.error('Error calling docker worker:', error);
    return { result: 'NOT_WORKING: Docker worker error - ' + error.message };
  }
}

async function videoCheck(demoUrl) {
  try {
    const promptText = await prompt('video_justification', { url: demoUrl })
    const workerResult = await runWorkerDocker(promptText)

    console.log('worker result', workerResult.result);

    if (workerResult.result.toUpperCase().startsWith('JUSTIFIED')) {
      return 'success';
    } else if (workerResult.result.toUpperCase().startsWith('NOT_JUSTIFIED')) {
      return 'failed';
    } else {
      return 'inference-error';
    }
  } catch (error) {
    console.error('Error calling docker worker:', error);
    return 'inference-error';
  }
}

async function isRealCheck(demoUrl) {
  // check the project & come up with a testing task
  const testingTaskPrompt = await prompt('testing_task', { url: demoUrl })
  const testingTaskResponse = await runWorkerDocker(testingTaskPrompt)

  let testingTask = testingTaskResponse.result
  console.log('testing task', testingTask)
  
  // Validate that testing task returns proper status codes
  if (!testingTask.toUpperCase().startsWith('TASK:') && !testingTask.toUpperCase().startsWith('NO_TASK:')) {
    // If the response looks like it actually performed a test (indicating a real app), treat as valid
    if (testingTask.toLowerCase().includes('tested') || 
        testingTask.toLowerCase().includes('successful') || 
        testingTask.toLowerCase().includes('functional') ||
        testingTask.toLowerCase().includes('working')) {
      // Convert to proper format
      testingTask = 'TASK: ' + testingTask;
    } else {
      // Invalid response format - treat as inference error
      return { result: 'HUMAN: AI inference error - invalid testing task format' }
    }
  }
  
  if (testingTask.toUpperCase().startsWith('NO_TASK:')) {
    // Convert NO_TASK from testing task to HUMAN for certain cases
    if (testingTask.toLowerCase().includes('mobile app') || 
        testingTask.toLowerCase().includes('cli tool') ||
        testingTask.toLowerCase().includes('command-line') ||
        testingTask.toLowerCase().includes('right-click') ||
        testingTask.toLowerCase().includes('drag') ||
        testingTask.toLowerCase().includes('special interaction')) {
      return { result: 'HUMAN: ' + testingTask.substring(8) }; // Remove "NO_TASK: " prefix
    }
    return { result: 'HUMAN: ' + testingTask.substring(8) }
  }

  const isRealPrompt = await prompt('is_real', { url: demoUrl, testing_task: testingTask })
  const isRealResponse = await runWorkerDocker(isRealPrompt)

  return {
    result: isRealResponse.result,
    gifPath: isRealResponse.gif
  }
}

async function checkRepoForRelease(repoUrl, readmeUrl) {
  const promptText = await prompt('has_release', { url: repoUrl })
  const workerResult = await runWorkerDocker(promptText)
  
  console.log('worker result', workerResult.result);

  if (workerResult.result.toUpperCase().startsWith("HAS_RELEASE") || workerResult.result.toUpperCase().startsWith("NO_RELEASE")) {
    return workerResult.result
  } else {
    return 'inference-error'
  }
}

// CLI entry point for testing
if (import.meta.main) {
  const demoUrl = process.argv[2]
  const repoUrl = process.argv[3]
  
  if (!demoUrl) {
    console.error('Usage: bun run worker.js <demo_url> [repo_url]')
    process.exit(1)
  }
  
  try {
    console.log(`🔍 Analyzing demo: ${demoUrl}`)
    if (repoUrl) console.log(`📁 Repository: ${repoUrl}`)
    
    const result = await analyzeHackathonProject(repoUrl || '', demoUrl)
    console.log('📊 Analysis Result:')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Export for testing and use by mole-server
export { analyzeHackathonProject, WorkerRateLimitError, WorkerShutdownError }