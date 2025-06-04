import { Anthropic } from '@anthropic-ai/sdk'

// Auto-load .env if it exists
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envPath = join(__dirname, '../.env')
if (existsSync(envPath)) {
  const envFile = await Bun.file(envPath).text()
  for (const line of envFile.split('\n')) {
    if (line.includes('=')) {
      const [key, value] = line.split('=', 2)
      process.env[key] = value
    }
  }
}

// Docker worker helper function
async function runWorkerDocker(prompt) {
  try {
    const proc = Bun.spawn(['docker', 'run', '--rm', '-e', `OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`, '-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`, 'mole-worker', prompt], {
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

async function analyzeHackathonProject(repoUrl='', demoUrl='', readmeUrl='') {
  // check all are accessible
  console.log('checking basic check')
  let checkedReadmeUrl = readmeUrl
  if (!readmeUrl) {
    checkedReadmeUrl = await inferReadmeUrl(repoUrl)
  }
  if (!checkedReadmeUrl) {
    return {
      decision: 'false',
      reason: 'README or repo not found',
    }
  }
  
  // Try to infer demo URL from README and repo if not provided
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
    }
  }

  console.log('checking readme check')
  const readmeCheckResult = await readmeCheck(checkedReadmeUrl)
  console.log('result:', readmeCheckResult)
  if (readmeCheckResult.toUpperCase().startsWith('TEMPLATED')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
    }
  }
  if (readmeCheckResult.toUpperCase().startsWith('AI_GENERATED')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
    }
  }

  if (!readmeCheckResult.toUpperCase().startsWith('SPECIFIC')) {
    return {
      decision: 'false',
      reason: 'AI inference error on readme check: ' + readmeCheckResult,
    }
  }
  
  // Skip live demo check if no demoUrl provided
  if (!checkedDemoUrl) {
    return {
      decision: 'false',
      reason: 'No demo URL found or provided',
    }
  }
  
  console.log('checking live demo check')
  const liveDemoResult = await liveDemoCheck(checkedDemoUrl)
  console.log('result:', liveDemoResult)

  if (liveDemoResult.toUpperCase().startsWith('DEMO_LINK')) {
    // return {
    //   decision: 'true',
    //   reason: 'Live demo is working: ' + liveDemoResult,
    // }
    const isRealResult = await isRealCheck(checkedDemoUrl)
    console.log('result:', isRealResult)
    if (isRealResult.toUpperCase().startsWith('NO_TASK')) {
      return {
        decision: 'false',
        reason: isRealResult,
      }
    } else if (isRealResult.toUpperCase().startsWith('DEMO')) {
      return {
        decision: 'false',
        reason: 'Link is a demo, not a shipped project: ' + isRealResult,
      }
    } else if (isRealResult.toUpperCase().startsWith('REAL')) {
      return {
        decision: 'true',
        reason: 'Live demo is a real project: ' + isRealResult,
      }
    } else if (isRealResult.toUpperCase().startsWith('HUMAN')) {
      return {
        decision: 'human',
        reason: 'Requires human evaluation: ' + isRealResult,
      }
    } else {
      return {
        decision: 'false',
        reason: 'AI inference error on live demo check: ' + isRealResult,
      }
    }
  }

  if (liveDemoResult.toUpperCase().startsWith('VIDEO_LINK')) {
    console.log('checking video check')
    const videoResult = await videoCheck(checkedDemoUrl)
    console.log('result:', videoResult)
    if (videoResult == 'success') {
      return {
        decision: 'true',
        reason: 'Live demo is a video',
      }
    } else if (videoResult == 'failed') {
      console.log('checking repo for release')
      const checkRepoResult = await checkRepoForRelease(repoUrl, checkedReadmeUrl)
      if (checkRepoResult.toUpperCase().startsWith('HAS_RELEASE')) {
        return {
          decision: 'true',
          reason: `Live demo is a video, but the repo has a release. ${checkRepoResult}`,
        }
      } else if (checkRepoResult.toUpperCase().startsWith('NO_RELEASE')) {
        return {
          decision: 'false',
          reason: `Live demo is a video, but the repo does not have a release. ${checkRepoResult}`,
        }
      } else {
        return {
          decision: 'false',
          reason: 'Error checking repo for release',
        }
      }
    } else {
      return {
        decision: 'false',
        reason: 'Error checking video',
      }
    }
  }


  if (liveDemoResult.toUpperCase().startsWith('NOT_WORKING')) {
    return {
      decision: 'false',
      reason: 'Live demo is not working: ' + liveDemoResult
    }
  }

  // if result doesn't start with demo link, video link, or not working, it's an inference error
  return {
    decision: 'false',
    reason: 'AI inference error on live demo check: ' + liveDemoResult,
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

async function inference(prompt) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const result = response.content[0].text
  console.log({prompt, result})
  return result
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

    console.log('python result', result.result);
    return result.result
  } catch (error) {
    console.error('Error calling docker worker:', error);
    return 'failed';
  }
}

async function videoCheck(demoUrl) {
  try {
    const promptText = await prompt('video_justification', { url: demoUrl })
    const workerResult = await runWorkerDocker(promptText)

    console.log('python result', workerResult.result);

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

  const testingTask = testingTaskResponse.result
  console.log('testing task', testingTask)
  
  // Validate that testing task returns proper status codes
  if (!testingTask.toUpperCase().startsWith('TASK:') && !testingTask.toUpperCase().startsWith('NO_TASK:')) {
    // Invalid response format - treat as inference error
    return 'HUMAN: AI inference error - invalid testing task format'
  }
  
  if (testingTask.toUpperCase().startsWith('NO_TASK:')) {
    // Convert NO_TASK from testing task to HUMAN for certain cases
    if (testingTask.toLowerCase().includes('mobile app') || 
        testingTask.toLowerCase().includes('cli tool') ||
        testingTask.toLowerCase().includes('command-line') ||
        testingTask.toLowerCase().includes('right-click') ||
        testingTask.toLowerCase().includes('drag') ||
        testingTask.toLowerCase().includes('special interaction')) {
      return 'HUMAN: ' + testingTask.substring(8); // Remove "NO_TASK: " prefix
    }
    return 'HUMAN: ' + testingTask.substring(8)
  }

  const isRealPrompt = await prompt('is_real', { url: demoUrl, testing_task: testingTask })
  const isRealResponse = await runWorkerDocker(isRealPrompt)

  return isRealResponse.result
}

async function checkRepoForRelease(repoUrl, readmeUrl) {
  const promptText = await prompt('has_release', { url: repoUrl })
  const workerResult = await runWorkerDocker(promptText)
  
  console.log('python result', workerResult.result);

  if (workerResult.result.toUpperCase().startsWith("HAS_RELEASE") || workerResult.result.toUpperCase().startsWith("NO_RELEASE")) {
    return workerResult.result
  } else {
    return 'inference-error'
  }
}

// Export for testing and use by mole-server
export { analyzeHackathonProject }