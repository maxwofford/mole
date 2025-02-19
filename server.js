import { Anthropic } from '@anthropic-ai/sdk'
import { serve } from "bun";
import ngrok from 'ngrok';

let pythonProcess = null;

async function startPythonServer() {
  console.log('Starting Python Flask server...');
  pythonProcess = Bun.spawn(['python', 'browser-use.py'], {
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe'
  });

  // Pipe Python stdout to console
  pythonProcess.stdout.pipeTo(
    new WritableStream({
      write(chunk) {
        const text = new TextDecoder().decode(chunk);
        console.log('[Python]:', text.trim());
      }
    })
  );

  // Pipe Python stderr to console
  pythonProcess.stderr.pipeTo(
    new WritableStream({
      write(chunk) {
        const text = new TextDecoder().decode(chunk);
        console.error('[Python Error]:', text.trim());
      }
    })
  );

  // Wait for the server to be ready
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch('http://localhost:3001/ping');
      if (response.ok) {
        console.log('Python Flask server is ready');
        return true;
      }
    } catch (error) {
      console.log('Waiting for Python server to start...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Python Flask server failed to start');
}

async function startNgrok() {
  console.log('Starting ngrok tunnel...');
  try {
    const url = await ngrok.connect({
      addr: 3000,
    });
    console.log('ngrok tunnel started');
    console.log('Public URL:', url);
  } catch (error) {
    console.error('Failed to start ngrok:', error);
    throw error;
  }
}

// Update cleanup handler
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (pythonProcess) {
    pythonProcess.kill();
  }
  await ngrok.kill();
  process.exit(0);
});

async function analyzeHackathonProject(repoUrl='', demoUrl='', readmeUrl='') {
  // check all are accessible
  console.log('checking basic check')
  const basicResult = await basicCheck(repoUrl, demoUrl, readmeUrl)
  console.log('result:', basicResult)

  if (basicResult == 'failed') {
    return {
      decision: 'false',
      reason: 'Some of the URLs are not accessible',
    }
  }

  console.log('checking readme check')
  const readmeCheckResult = await readmeCheck(readmeUrl)
  console.log('result:', readmeCheckResult)
  if (readmeCheckResult.startsWith('templated')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
    }
  }
  if (readmeCheckResult.startsWith('ai-generated')) {
    return {
      decision: 'false',
      reason: readmeCheckResult,
    }
  }

  if (!readmeCheckResult.startsWith('specific')) {
    return {
      decision: 'false',
      reason: 'AI inference error on readme check: ' + readmeCheckResult,
    }
  }
  
  console.log('checking live demo check')
  const liveDemoResult = await liveDemoCheck(demoUrl)
  console.log('result:', liveDemoResult)

  if (liveDemoResult.startsWith('demo link')) {
    return {
      decision: 'true',
      reason: 'Live demo is working: ' + liveDemoResult,
    }
  }

  if (liveDemoResult.startsWith('video link')) {
    console.log('checking video check')
    const videoResult = await videoCheck(demoUrl)
    console.log('result:', videoResult)
    if (videoResult == 'success') {
      return {
        decision: 'true',
        reason: 'Live demo is a video',
      }
    } else if (videoResult == 'failed') {
      console.log('checking repo for release')
      const checkRepoResult = await checkRepoForRelease(repoUrl, readmeUrl)
      if (checkRepoResult.startsWith('yes')) {
        return {
          decision: 'true',
          reason: `Live demo is a video, but the repo has a release. ${checkRepoResult}`,
        }
      } else if (checkRepoResult.startsWith('no')) {
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


  if (liveDemoResult.startsWith('not working')) {
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
  const [repoResponse, demoResponse, readmeResponse] = await Promise.all([
    fetch(repoUrl),
    fetch(demoUrl),
    fetch(readmeUrl),
  ])
  if (!repoResponse.ok || !demoResponse.ok || !readmeResponse.ok) {
    return 'failed'
  }

  return 'success'
}

async function readmeCheck(readme) {
  const readmeText = await fetch(readme).then(res => res.text())
  
  const prompt = await Bun.file('./prompts/review_readme.txt').text()
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: prompt + '\n\n' + readmeText.substring(0, 1000),
      },
    ],
  })

  const result = response.content[0].text
  return result
}

async function liveDemoCheck(demoUrl) {
  try {
    const prompt = await Bun.file('./prompts/live_demo.txt').text()
    const response = await fetch('http://localhost:3001/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.replace('{{url}}', demoUrl)
      })
    });

    if (!response.ok) {
      console.error('Flask server error:', await response.text());
      return 'failed';
    }

    const { result, gif }= await response.json();
    
    console.log('python result', result);
    console.log('python reasoning', gif)
    return result
  } catch (error) {
    console.error('Error calling Flask server:', error);
    return 'failed';
  }
}

async function videoCheck(demoUrl) {
  try {
    const prompt = await Bun.file('./prompts/video_justification.txt').text()
    const response = await fetch('http://localhost:3001/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.replace('{{url}}', demoUrl)
      })
    });

    if (!response.ok) {
      console.error('Flask server error:', await response.text());
      return 'inference-error';
    }

    const { result, gif }= await response.json();
    
    console.log('python result', result);
    console.log('python reasoning', gif)

    if (result == 'justified') {
      return 'success';
    } else if (result == 'not justified') {
      return 'failed';
    } else {
      return 'inference-error';
    }
  } catch (error) {
    console.error('Error calling Flask server:', error);
    return 'inference-error';
  }
}

async function checkRepoForRelease(repoUrl, readmeUrl) {
  const prompt = await Bun.file('./prompts/has_release.txt').text()
  const response = await fetch('http://localhost:3001/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt.replace('{{url}}', repoUrl)
    })
  })

  const { result, gif }= await response.json();
  
  console.log('python result', result);
  console.log('python reasoning', gif)

  if (result.startsWith("yes") || result.startsWith("no")) {
    return result
  } else {
    return 'inference-error'
  }
}

const server = serve({
  port: 3000,
  async fetch(req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only accept POST requests to /analyze
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await req.json();
      const { repoUrl, demoUrl, readmeUrl } = body;
      console.log("Analyzing hackathon project...")

      const result = await analyzeHackathonProject(repoUrl, demoUrl, readmeUrl);

      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (error) {
      console.error('Server error:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          details: error.message 
        }), 
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
  },
});

// the startup sequence
try {
  await startNgrok();
  await startPythonServer();
  console.log(`Bun server listening on http://localhost:${server.port}`);
} catch (error) {
  console.error('Failed to start services:', error);
  // Cleanup any processes that did start
  if (pythonProcess) pythonProcess.kill();
  await ngrok.kill();
  process.exit(1);
}