import { GoogleGenerativeAI } from '@google/generative-ai'
import { Anthropic } from '@anthropic-ai/sdk'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// AI setup based on environment variable
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'
let aiInstance = null

function getAIInstance() {
  if (!aiInstance) {
    switch (AI_PROVIDER) {
      case 'gemini':
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
        aiInstance = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
        break
      case 'anthropic':
        aiInstance = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        })
        break
      default:
        throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`)
    }
  }
  return aiInstance
}

async function prompt(name, replacements = {}) {
  const promptPath = join(__dirname, `prompts/${name}.txt`)
  const promptText = await Bun.file(promptPath).text()
  let processed = promptText
  
  for (const [key, value] of Object.entries(replacements)) {
    processed = processed.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  
  return processed
}

async function inference(promptText) {
  const ai = getAIInstance()
  
  if (AI_PROVIDER === 'gemini') {
    const result = await ai.generateContent(promptText)
    const response = await result.response
    return response.text().trim()
  }
  
  if (AI_PROVIDER === 'anthropic') {
    const result = await ai.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: promptText,
        },
      ],
    })
    
    return result.content[0].text.trim()
  }
  
  throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`)
}

async function getReadmeContent(repoUrl) {
  // Extract owner/repo from GitHub URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
  if (!match) return null
  
  const [, owner, repo] = match
  const cleanRepo = repo.replace(/\.git$/, '')
  
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`)
    const data = await response.json()
    if (response.status !== 200) return null
    
    const readmeResponse = await fetch(data.download_url)
    return await readmeResponse.text()
  } catch (error) {
    console.error('Error fetching README:', error)
    return null
  }
}

async function getDemoUrl(repoUrl, readmeContent) {
  // Simple demo URL extraction from repo metadata
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
  if (!match) return null
  
  const [, owner, repo] = match
  const cleanRepo = repo.replace(/\.git$/, '')
  
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`)
    const repoData = await response.json()
    
    if (repoData.homepage && repoData.homepage.startsWith('http')) {
      return repoData.homepage
    }
    
    // Extract URLs from README
    if (readmeContent) {
      const urlRegex = /https?:\/\/[^\s)]+/g
      const urls = readmeContent.match(urlRegex) || []
      const demoUrls = urls.filter(url => 
        !url.includes('github.com') && 
        !url.includes('githubusercontent.com') &&
        (url.includes('.app') || url.includes('.dev') || url.includes('.com'))
      )
      if (demoUrls.length > 0) return demoUrls[0]
    }
    
    return null
  } catch (error) {
    console.error('Error getting demo URL:', error)
    return null
  }
}

async function inferProjectLinks(projectData) {
  const promptText = await prompt('infer_project_links', {
    project_data: projectData
  })
  
  const result = await inference(promptText)
  
  // Parse the response to extract DEMO, REPO, READ links
  const lines = result.split('\n')
  const links = {}
  
  for (const line of lines) {
    if (line.startsWith('DEMO:')) {
      links.demo = line.substring(5).trim() || null
    } else if (line.startsWith('REPO:')) {
      links.repo = line.substring(5).trim() || null
    } else if (line.startsWith('READ:')) {
      links.readme = line.substring(5).trim() || null
    }
  }
  
  // Clean up empty strings to null
  for (const key in links) {
    if (links[key] === '') {
      links[key] = null
    }
  }
  
  return links
}

async function classifyProjectType(repoUrl, readmeContent) {
  const promptText = await prompt('classify_project_type', {
    repo_url: repoUrl,
    readme_content: readmeContent?.substring(0, 1000) || 'No README found'
  })
  
  return await inference(promptText)
}

// Docker worker helper function for browser automation
async function runWorkerDocker(prompt) {
  try {
    // Ensure GIF directory exists on host
    await Bun.spawn(['mkdir', '-p', '/tmp/agent_history_gifs']).exited;
    
    const proc = Bun.spawn(['docker', 'run', '--rm', 
      '-v', '/tmp/agent_history_gifs:/tmp/agent_history_gifs',
      '-e', `AI_PROVIDER=${process.env.AI_PROVIDER}`,
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

async function testStaticWebsite(demoUrl) {
  try {
    const promptText = await prompt('static_website_check', { url: demoUrl })
    const result = await runWorkerDocker(promptText)
    
    console.log('Static website test result:', result.result)
    
    // Handle empty or invalid responses
    if (!result.result || result.result.trim() === '' || result.result === 'none') {
      return 'NOT_WORKING: Browser automation returned empty result'
    }
    
    return result.result
  } catch (error) {
    console.error('Error testing static website:', error)
    return 'NOT_WORKING: Browser automation error - ' + error.message
  }
}

async function testWebApp(demoUrl) {
  try {
    const promptText = await prompt('web_app_check', { url: demoUrl })
    const result = await runWorkerDocker(promptText)
    
    console.log('Web app test result:', result.result)
    
    // Handle empty or invalid responses
    if (!result.result || result.result.trim() === '' || result.result === 'none') {
      return 'NOT_WORKING: Browser automation returned empty result'
    }
    
    return result.result
  } catch (error) {
    console.error('Error testing web app:', error)
    return 'NOT_WORKING: Browser automation error - ' + error.message
  }
}

export async function analyzeProjectFromLinks(projectData, statusReporter = null) {
  if (statusReporter) statusReporter('Inferring project links', 1, 'Processing provided project data')
  
  const links = await inferProjectLinks(projectData)
  console.log('Inferred links:', links)
  
  if (!links.repo) {
    return {
      decision: 'false',
      reason: 'Could not infer repository URL from provided data',
      type: 'unknown',
      inferredLinks: links
    }
  }
  
  return await analyzeProject(links.repo, links.demo, links.readme, statusReporter)
}

export async function analyzeProject(repoUrl, demoUrl = null, readmeUrl = null, statusReporter = null) {
  if (statusReporter) statusReporter('Getting README', 1, 'Fetching project information')
  
  let readmeContent = null
  
  if (readmeUrl) {
    try {
      const response = await fetch(readmeUrl)
      readmeContent = await response.text()
    } catch (error) {
      console.error('Error fetching provided README URL:', error)
    }
  }
  
  if (!readmeContent) {
    readmeContent = await getReadmeContent(repoUrl)
  }
  
  if (!readmeContent) {
    return {
      decision: 'false',
      reason: 'No README found or repo inaccessible',
      type: 'unknown'
    }
  }
  
  if (statusReporter) statusReporter('Classifying project type', 2, 'Determining project category')
  
  const projectType = await classifyProjectType(repoUrl, readmeContent)
  console.log('Project type:', projectType)
  
  // Route based on project type
  switch (projectType.toUpperCase()) {
    case 'DOWNLOADABLE_APPLICATION':
      return {
        decision: 'human',
        reason: 'HUMAN: downloadable application needs review',
        type: 'downloadable_application'
      }
      
    case 'MOBILE_APP':
      return {
        decision: 'human', 
        reason: 'HUMAN: android/iphone app needs review',
        type: 'mobile_app'
      }
      
    case 'DISCORD_BOT':
      return {
        decision: 'human',
        reason: 'HUMAN: discord bot needs review', 
        type: 'discord_bot'
      }
      
    case 'SLACK_BOT':
      return {
        decision: 'human',
        reason: 'HUMAN: slack bot needs review',
        type: 'slack_bot'
      }
      
    case 'STATIC_WEBSITE':
      if (statusReporter) statusReporter('Getting demo URL', 3, 'Finding website URL')
      
      const staticDemoUrl = demoUrl || await getDemoUrl(repoUrl, readmeContent)
      if (!staticDemoUrl) {
        return {
          decision: 'false',
          reason: 'No demo URL found for static website',
          type: 'static_website'
        }
      }
      
      if (statusReporter) statusReporter('Testing static website', 4, `Testing: ${staticDemoUrl}`)
      
      const staticResult = await testStaticWebsite(staticDemoUrl)
      const resultUpper = staticResult.toUpperCase()
      const isWorking = resultUpper.startsWith('WORKING') || resultUpper.includes('WORKING:')
      return {
        decision: isWorking ? 'true' : 'false',
        reason: staticResult,
        type: 'static_website',
        demoUrl: staticDemoUrl
      }
      
    case 'WEB_APP':
      if (statusReporter) statusReporter('Getting demo URL', 3, 'Finding application URL')
      
      const webAppDemoUrl = demoUrl || await getDemoUrl(repoUrl, readmeContent)
      if (!webAppDemoUrl) {
        return {
          decision: 'false', 
          reason: 'No demo URL found for web application',
          type: 'web_app'
        }
      }
      
      if (statusReporter) statusReporter('Testing web application', 4, `Testing: ${webAppDemoUrl}`)
      
      const webAppResult = await testWebApp(webAppDemoUrl)
      return {
        decision: webAppResult.toUpperCase().startsWith('REAL') ? 'true' : 'false',
        reason: webAppResult,
        type: 'web_app', 
        demoUrl: webAppDemoUrl
      }
      
    default:
      return {
        decision: 'false',
        reason: `Unknown project type: ${projectType}`,
        type: 'unknown'
      }
  }
}

// CLI entry point
if (import.meta.main) {
  const repoUrl = process.argv[2]
  
  if (!repoUrl) {
    console.error('Usage: bun run worker.js <repo_url>')
    process.exit(1)
  }
  
  try {
    console.log(`🔍 Analyzing: ${repoUrl}`)
    const result = await analyzeProject(repoUrl)
    console.log('📊 Result:')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}
