import express from 'express'
import path from 'path'
import { analyzeProject, analyzeProjectFromLinks } from '../worker/worker.js'

const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
app.use(express.static('public'))

// Store analysis results in memory (in production, use a database)
const results = new Map()
const jobs = new Map()

// Polling configuration
const POLL_INTERVAL = 5000 // 5 seconds
let isPolling = false
let pollQueue = [] // Simple queue for demo URLs to process

// Worker stats
const workerStats = {
  active: 0,
  completed: 0,
  failed: 0,
  startTime: Date.now()
}

// Status updates for real-time feedback
app.get('/api/status/:jobId', (req, res) => {
  const jobId = req.params.jobId
  const job = jobs.get(jobId)
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  
  res.json(job)
})

// Submit analysis job
app.post('/api/analyze', async (req, res) => {
  const { projectData, repoUrl } = req.body
  
  if (!projectData && !repoUrl) {
    return res.status(400).json({ error: 'Project data or repository URL required' })
  }
  
  const jobId = Date.now().toString()
  
  // Initialize job status
  jobs.set(jobId, {
    id: jobId,
    status: 'queued',
    projectData: projectData || repoUrl,
    progress: 0,
    currentStep: 'Starting analysis...',
    result: null
  })
  
  // Choose analysis method based on input
  const analysisPromise = projectData 
    ? analyzeProjectFromLinks(projectData, (step, progress, description) => {
        const job = jobs.get(jobId)
        if (job) {
          job.currentStep = step
          job.progress = progress
          job.description = description
          job.status = 'running'
        }
      })
    : analyzeProject(repoUrl, null, null, (step, progress, description) => {
        const job = jobs.get(jobId)
        if (job) {
          job.currentStep = step
          job.progress = progress
          job.description = description
          job.status = 'running'
        }
      })
  
  // Start analysis in background
  analysisPromise.then(result => {
    const job = jobs.get(jobId)
    if (job) {
      job.status = 'completed'
      job.progress = 100
      job.result = result
      job.currentStep = 'Analysis complete'
      
      // Store result
      results.set(jobId, result)
    }
  }).catch(error => {
    const job = jobs.get(jobId)
    if (job) {
      job.status = 'failed'
      job.error = error.message
      job.currentStep = 'Analysis failed'
    }
  })
  
  res.json({ jobId, status: 'queued' })
})

// Get analysis results
app.get('/api/results/:jobId', (req, res) => {
  const jobId = req.params.jobId
  const result = results.get(jobId)
  
  if (!result) {
    return res.status(404).json({ error: 'Result not found' })
  }
  
  res.json(result)
})

// Polling endpoints
app.get('/api/polling/status', (req, res) => {
  res.json({
    isPolling,
    queueLength: pollQueue.length,
    stats: workerStats,
    uptime: Date.now() - workerStats.startTime
  })
})

app.post('/api/polling/start', (req, res) => {
  if (!isPolling) {
    startPolling()
    res.json({ success: true, message: 'Polling started' })
  } else {
    res.json({ success: false, message: 'Polling already active' })
  }
})

app.post('/api/polling/stop', (req, res) => {
  isPolling = false
  res.json({ success: true, message: 'Polling stopped' })
})

app.post('/api/polling/add', (req, res) => {
  const { projectData, repoUrl } = req.body
  
  if (!projectData && !repoUrl) {
    return res.status(400).json({ error: 'Project data or repository URL required' })
  }
  
  const queueItem = {
    id: Date.now().toString(),
    data: projectData || repoUrl,
    type: projectData ? 'links' : 'repo',
    addedAt: Date.now()
  }
  
  pollQueue.push(queueItem)
  res.json({ success: true, id: queueItem.id, queuePosition: pollQueue.length })
})

// Dashboard page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mole v2 - Project Analyzer</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin: 20px 0; }
        input[type="url"] { width: 100%; padding: 10px; font-size: 16px; }
        button { padding: 10px 20px; font-size: 16px; background: #007bff; color: white; border: none; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { margin: 20px 0; padding: 15px; border-radius: 5px; }
        .status.running { background: #e7f3ff; border: 1px solid #007bff; }
        .status.completed { background: #e7f5e7; border: 1px solid #28a745; }
        .status.failed { background: #ffe7e7; border: 1px solid #dc3545; }
        .progress { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
        .progress-bar { height: 100%; background: #007bff; transition: width 0.3s; }
        .result { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
        .type-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .type-static_website { background: #e3f2fd; color: #1976d2; }
        .type-web_app { background: #e8f5e8; color: #2e7d32; }
        .type-mobile_app { background: #fff3e0; color: #f57c00; }
        .type-downloadable_application { background: #f3e5f5; color: #7b1fa2; }
        .type-discord_bot { background: #e8eaf6; color: #3f51b5; }
        .type-slack_bot { background: #fff8e1; color: #f9a825; }
        textarea { width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <h1>🕳️ Mole v2 - Project Analyzer</h1>
      <p>Simplified project classification and testing system</p>
      
      <!-- Polling Status Section -->
      <div class="polling-section" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
        <h3>Polling Status</h3>
        <div id="pollingStatus">Loading...</div>
        <div style="margin-top: 10px;">
          <button id="startPolling" onclick="togglePolling(true)">Start Polling</button>
          <button id="stopPolling" onclick="togglePolling(false)">Stop Polling</button>
          <button onclick="addToQueue()">Add Current Project to Queue</button>
        </div>
        <div id="queueStatus" style="margin-top: 10px;"></div>
      </div>
      
      <div class="form-group">
        <label>
          <input type="radio" name="inputMode" value="links" checked onchange="toggleInputMode()"> 
          Project Links (infer missing links with AI)
        </label>
      </div>
      
      <div class="form-group">
        <label>
          <input type="radio" name="inputMode" value="repo" onchange="toggleInputMode()"> 
          Repository URL Only
        </label>
      </div>
      
      <div id="linksMode" class="form-group">
        <label for="projectData">Project Information:</label>
        <textarea id="projectData" rows="6" placeholder="Paste any combination of:
- Demo/live site URL
- Repository URL  
- README URL
- Project description
- Links from submission forms

Example:
Demo: https://myapp.vercel.app
Repo: https://github.com/user/project
This is a web app for tracking habits..."></textarea>
      </div>
      
      <div id="repoMode" class="form-group" style="display: none;">
        <label for="repoUrl">Repository URL:</label>
        <input type="url" id="repoUrl" placeholder="https://github.com/user/repo" />
      </div>
      
      <button onclick="analyzeProject()">Analyze Project</button>
      
      <div id="status" style="display: none;"></div>
      <div id="result" style="display: none;"></div>
      
      <script>
        let currentJobId = null;
        let statusInterval = null;
        let pollingStatusInterval = null;
        
        // Start polling status updates
        updatePollingStatus();
        pollingStatusInterval = setInterval(updatePollingStatus, 2000);
        
        function toggleInputMode() {
          const mode = document.querySelector('input[name="inputMode"]:checked').value;
          const linksMode = document.getElementById('linksMode');
          const repoMode = document.getElementById('repoMode');
          
          if (mode === 'links') {
            linksMode.style.display = 'block';
            repoMode.style.display = 'none';
          } else {
            linksMode.style.display = 'none';
            repoMode.style.display = 'block';
          }
        }
        
        async function analyzeProject() {
          const mode = document.querySelector('input[name="inputMode"]:checked').value;
          let requestBody = {};
          
          if (mode === 'links') {
            const projectData = document.getElementById('projectData').value;
            if (!projectData.trim()) {
              alert('Please enter project information');
              return;
            }
            requestBody = { projectData };
          } else {
            const repoUrl = document.getElementById('repoUrl').value;
            if (!repoUrl) {
              alert('Please enter a repository URL');
              return;
            }
            requestBody = { repoUrl };
          }
          
          try {
            const response = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            currentJobId = data.jobId;
            
            document.getElementById('status').style.display = 'block';
            document.getElementById('result').style.display = 'none';
            
            statusInterval = setInterval(checkStatus, 1000);
          } catch (error) {
            alert('Error: ' + error.message);
          }
        }
        
        async function checkStatus() {
          if (!currentJobId) return;
          
          try {
            const response = await fetch('/api/status/' + currentJobId);
            const job = await response.json();
            
            const statusDiv = document.getElementById('status');
            const progressPercent = job.progress || 0;
            
            statusDiv.className = 'status ' + job.status;
            statusDiv.innerHTML = \`
              <div><strong>Status:</strong> \${job.status}</div>
              <div><strong>Step:</strong> \${job.currentStep}</div>
              \${job.description ? '<div><strong>Details:</strong> ' + job.description + '</div>' : ''}
              <div class="progress">
                <div class="progress-bar" style="width: \${progressPercent}%"></div>
              </div>
              <div><small>\${progressPercent}% complete</small></div>
            \`;
            
            if (job.status === 'completed') {
              clearInterval(statusInterval);
              showResult(job.result);
            } else if (job.status === 'failed') {
              clearInterval(statusInterval);
              statusDiv.innerHTML += '<div><strong>Error:</strong> ' + job.error + '</div>';
            }
          } catch (error) {
            console.error('Error checking status:', error);
          }
        }
        
        function showResult(result) {
          const resultDiv = document.getElementById('result');
          const decisionColor = result.decision === 'true' ? '#28a745' : 
                               result.decision === 'human' ? '#ffc107' : '#dc3545';
          
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = \`
            <h3>Analysis Result</h3>
            <div><strong>Decision:</strong> <span style="color: \${decisionColor}; font-weight: bold;">\${result.decision.toUpperCase()}</span></div>
            <div><strong>Type:</strong> <span class="type-badge type-\${result.type}">\${result.type}</span></div>
            <div><strong>Reason:</strong> \${result.reason}</div>
            \${result.demoUrl ? '<div><strong>Demo URL:</strong> <a href="' + result.demoUrl + '" target="_blank">' + result.demoUrl + '</a></div>' : ''}
          \`;
        }
        
        async function updatePollingStatus() {
          try {
            const response = await fetch('/api/polling/status');
            const status = await response.json();
            
            const pollingDiv = document.getElementById('pollingStatus');
            const queueDiv = document.getElementById('queueStatus');
            
            const uptimeMinutes = Math.floor(status.uptime / 60000);
            
            pollingDiv.innerHTML = \`
              <div><strong>Status:</strong> <span style="color: \${status.isPolling ? '#28a745' : '#dc3545'};">\${status.isPolling ? 'ACTIVE' : 'STOPPED'}</span></div>
              <div><strong>Queue:</strong> \${status.queueLength} items waiting</div>
              <div><strong>Workers:</strong> \${status.stats.active} active</div>
              <div><strong>Completed:</strong> \${status.stats.completed} | <strong>Failed:</strong> \${status.stats.failed}</div>
              <div><strong>Uptime:</strong> \${uptimeMinutes}m</div>
            \`;
            
            document.getElementById('startPolling').disabled = status.isPolling;
            document.getElementById('stopPolling').disabled = !status.isPolling;
            
          } catch (error) {
            console.error('Error updating polling status:', error);
          }
        }
        
        async function togglePolling(start) {
          try {
            const response = await fetch(\`/api/polling/\${start ? 'start' : 'stop'}\`, {
              method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
              updatePollingStatus();
            } else {
              alert(result.message);
            }
          } catch (error) {
            alert('Error: ' + error.message);
          }
        }
        
        async function addToQueue() {
          const mode = document.querySelector('input[name="inputMode"]:checked').value;
          let requestBody = {};
          
          if (mode === 'links') {
            const projectData = document.getElementById('projectData').value;
            if (!projectData.trim()) {
              alert('Please enter project information');
              return;
            }
            requestBody = { projectData };
          } else {
            const repoUrl = document.getElementById('repoUrl').value;
            if (!repoUrl) {
              alert('Please enter a repository URL');
              return;
            }
            requestBody = { repoUrl };
          }
          
          try {
            const response = await fetch('/api/polling/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });
            
            const result = await response.json();
            
            if (result.success) {
              alert(\`Added to queue at position \${result.queuePosition}\`);
              updatePollingStatus();
            } else {
              alert('Error: ' + result.error);
            }
          } catch (error) {
            alert('Error: ' + error.message);
          }
        }
      </script>
    </body>
    </html>
  `)
})

// Polling logic
async function startPolling() {
  isPolling = true
  console.log('🔄 Starting polling system...')
  
  while (isPolling) {
    try {
      if (pollQueue.length > 0 && workerStats.active < 2) { // Max 2 concurrent workers
        const queueItem = pollQueue.shift()
        processQueueItem(queueItem)
      }
      
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
    } catch (error) {
      console.error('❌ Error in polling loop:', error)
      await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10s on error
    }
  }
  
  console.log('⏹️ Polling stopped')
}

async function processQueueItem(queueItem) {
  workerStats.active++
  
  const jobId = queueItem.id
  
  // Initialize job status
  jobs.set(jobId, {
    id: jobId,
    status: 'running',
    data: queueItem.data,
    type: queueItem.type,
    progress: 0,
    currentStep: 'Starting analysis...',
    result: null,
    startedAt: Date.now()
  })
  
  try {
    console.log(`🚀 Processing queue item: ${queueItem.id}`)
    
    // Choose analysis method based on type
    const analysisPromise = queueItem.type === 'links'
      ? analyzeProjectFromLinks(queueItem.data, (step, progress, description) => {
          const job = jobs.get(jobId)
          if (job) {
            job.currentStep = step
            job.progress = progress
            job.description = description
          }
        })
      : analyzeProject(queueItem.data, null, null, (step, progress, description) => {
          const job = jobs.get(jobId)
          if (job) {
            job.currentStep = step
            job.progress = progress
            job.description = description
          }
        })
    
    const result = await analysisPromise
    
    // Update job status
    const job = jobs.get(jobId)
    if (job) {
      job.status = 'completed'
      job.progress = 100
      job.result = result
      job.currentStep = 'Analysis complete'
      job.completedAt = Date.now()
      
      results.set(jobId, result)
    }
    
    workerStats.completed++
    console.log(`✅ Completed queue item: ${queueItem.id}`)
    
  } catch (error) {
    console.error(`❌ Error processing queue item ${queueItem.id}:`, error)
    
    const job = jobs.get(jobId)
    if (job) {
      job.status = 'failed'
      job.error = error.message
      job.currentStep = 'Analysis failed'
      job.completedAt = Date.now()
    }
    
    workerStats.failed++
  } finally {
    workerStats.active--
  }
}

app.listen(PORT, () => {
  console.log(`🕳️ Mole v2 Nexus running on http://localhost:${PORT}`)
  console.log('💡 Use /api/polling/start to begin polling mode')
})
