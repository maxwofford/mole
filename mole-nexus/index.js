import { analyzeHackathonProject, WorkerRateLimitError, WorkerShutdownError } from '../mole-worker/worker.js';
import { createMonitoringServer } from './monitoring.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// HTTP server for monitoring
let server;



// Configuration
const MAX_WORKERS = parseInt(process.env.MAX_MOLE_WORKERS) || 4;
const DOCKER_IMAGE_NAME = 'mole-worker';

// Airtable setup
const AIRTABLE_BASE_ID = 'appJoAAl0y0Pr2itM';
const AIRTABLE_TABLE_ID = 'tblVnBAyJGFUzRDes';

if (!process.env.AIRTABLE_API_KEY) {
  console.error('❌ AIRTABLE_API_KEY not found in environment variables');
  console.error('💡 Make sure .env file exists with AIRTABLE_API_KEY=your_key');
  process.exit(1);
}

// Helper function to make Airtable API calls
async function airtableRequest(method, endpoint, body = null) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${endpoint}`;
  
  console.log('🔑 Using API key:', process.env.AIRTABLE_API_KEY ? `${process.env.AIRTABLE_API_KEY.substring(0, 10)}...` : 'NOT SET');
  console.log('🌐 Calling URL:', url);
  console.log('🔧 Method:', method);
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  console.log({
    options, url
  })
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Semaphore for controlling concurrent workers
class Semaphore {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.currentCount = 0;
    this.waitingQueue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentCount < this.maxConcurrent) {
        this.currentCount++;
        resolve();
      } else {
        this.waitingQueue.push(resolve);
      }
    });
  }

  release() {
    if (this.waitingQueue.length > 0) {
      const nextResolve = this.waitingQueue.shift();
      nextResolve();
    } else {
      this.currentCount--;
    }
  }
}

const workerSemaphore = new Semaphore(MAX_WORKERS);

// Worker tracking for monitoring
let activeWorkers = new Map(); // Map of workerId -> { record, startTime, status }
let jobsProcessed = 0;
let totalJobs = 0;

// Docker management functions
async function checkDockerImageExists(imageName) {
  try {
    const proc = Bun.spawn(['docker', 'images', '-q', imageName], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    return exitCode === 0 && output.trim().length > 0;
  } catch (error) {
    console.error('Error checking Docker image:', error);
    return false;
  }
}

async function buildDockerImage(imageName) {
  console.log(`🔨 Building Docker image '${imageName}'...`);
  console.log('⚠️  This may take several minutes on first run');
  
  const workerPath = join(__dirname, '../mole-worker');
  
  try {
    const proc = Bun.spawn(['docker', 'build', '-t', imageName, '.'], {
      cwd: workerPath,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    // Stream the output in real-time
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      process.stdout.write(chunk);
    }
    
    const exitCode = await proc.exited;
    
    if (exitCode === 0) {
      console.log(`✅ Docker image '${imageName}' built successfully`);
      return true;
    } else {
      const errorOutput = await new Response(proc.stderr).text();
      console.error(`❌ Docker build failed with exit code ${exitCode}`);
      console.error('Error output:', errorOutput);
      return false;
    }
  } catch (error) {
    console.error('❌ Error building Docker image:', error);
    return false;
  }
}

async function ensureDockerImage(imageName) {
  console.log(`🔍 Checking if Docker image '${imageName}' exists...`);
  
  const exists = await checkDockerImageExists(imageName);
  
  if (exists) {
    console.log(`✅ Docker image '${imageName}' found`);
    return true;
  }
  
  console.log(`⚠️  Docker image '${imageName}' not found`);
  console.log(`🔨 Building Docker image automatically...`);
  
  const buildSuccess = await buildDockerImage(imageName);
  
  if (!buildSuccess) {
    console.error(`❌ Failed to build Docker image '${imageName}'`);
    console.error('🛠️  You can manually build it with:');
    console.error(`   cd mole-worker && docker build -t ${imageName} .`);
    return false;
  }
  
  return true;
}

// Process a single record
async function processRecord(record) {
  const recordId = record.id;
  const { repo_url, play_url, readme_url } = record.fields;
  const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🔄 Processing record: ${recordId}`);
  console.log(`   Repo: ${repo_url}`);
  console.log(`   Demo: ${play_url}`);
  console.log(`   Workers: ${workerSemaphore.currentCount}/${MAX_WORKERS} active, ${workerSemaphore.waitingQueue.length} queued`);
  
  // Acquire semaphore (wait if all workers are busy)
  await workerSemaphore.acquire();
  
  // Track worker start
  activeWorkers.set(workerId, {
    record: { id: recordId, repo_url, play_url },
    startTime: new Date(),
    status: 'analyzing'
  });
  
  try {
    const result = await analyzeHackathonProject(repo_url, play_url, readme_url);
    console.log(`✅ Analysis complete for ${recordId}: ${result.decision}`);
    
    // Update worker status
    if (activeWorkers.has(workerId)) {
      activeWorkers.get(workerId).status = 'updating';
    }
    
    // Find all records with the same repo_url and readme_url
    const duplicateParams = new URLSearchParams({
      filterByFormula: `AND(
        {repo_url} = "${repo_url}",
        ${readme_url ? `{readme_url} = "${readme_url}"` : 'BLANK() = {readme_url}'}
      )`
    });
    
    let duplicateRecords = [];
    try {
      const duplicateData = await airtableRequest('GET', `?${duplicateParams}`);
      duplicateRecords = duplicateData.records || [];
      console.log(`🔍 Found ${duplicateRecords.length} records with same repo/readme`);
    } catch (error) {
      console.error(`⚠️ Failed to find duplicates for ${recordId}:`, error);
      duplicateRecords = [{ id: recordId }]; // Fallback to just the current record
    }
    
    // Update all duplicate records
    for (const duplicate of duplicateRecords) {
      try {
        await airtableRequest('PATCH', duplicate.id, {
          fields: {
            'ai_guess': result.decision,
            'ai_reasoning': result.reason,
            'ai_model': result.model,
          }
        });
        console.log(`📝 Updated duplicate record ${duplicate.id}`);
      } catch (error) {
        console.error(`❌ Failed to update duplicate ${duplicate.id}:`, error);
      }
    }
    
    jobsProcessed++;
    
  } catch (error) {
    console.error(`❌ Error processing record ${recordId}:`, error);
    
    // Handle specific worker errors
    if (error instanceof WorkerRateLimitError) {
      console.log('⚠️ Worker hit rate limit - slowing down processing');
      await Bun.sleep(30000); // Wait 30 seconds before continuing
    } else if (error instanceof WorkerShutdownError) {
      console.log('🛑 Worker hit credit limit - shutting down nexus');
      process.exit(1);
    }
    
    // Update record with error status
    try {
      await airtableRequest('PATCH', recordId, {
        fields: {
          'ai_guess': 'error',
          'ai_reasoning': `Error: ${error.message}`,
        }
      });
    } catch (updateError) {
      console.error(`❌ Failed to update error status for ${recordId}:`, updateError);
    }
  } finally {
    // Clean up worker tracking
    activeWorkers.delete(workerId);
    
    // Always release the semaphore
    workerSemaphore.release();
  }
}

async function startNexus() {
  
  const dockerReady = await ensureDockerImage(DOCKER_IMAGE_NAME);
  
  if (!dockerReady) {
    console.error('❌ Cannot start nexus: Docker image not available');
    console.error('Please ensure Docker is installed and running');
    process.exit(1);
  }
  
  console.log(`✅ Mole Nexus ready!`);
  console.log(`🐳 Docker image '${DOCKER_IMAGE_NAME}' is ready`);
  console.log(`🔄 Starting job processing loop...\n`);
  
  while (true) {
    try {
      console.log(`🔍 Checking for records to process... (Active workers: ${workerSemaphore.currentCount}/${MAX_WORKERS})`);
      
      const availableWorkers = MAX_WORKERS - workerSemaphore.currentCount;
      
      if (availableWorkers === 0) {
        console.log('⏳ All workers busy, waiting 2 seconds...');
        await Bun.sleep(2000);
        continue;
      }
      
      // Fetch as many records as we have available workers
      const params = new URLSearchParams({
        filterByFormula: `AND(
          {ai_guess} = BLANK(),
          NOT(BLANK() = {play_url}),
          NOT(BLANK() = {repo_url})
        )`,
        maxRecords: availableWorkers.toString()
      });
      
      const data = await airtableRequest('GET', `?${params}`);
      const records = data.records;
      
      if (records.length === 0) {
        console.log('😴 No records to process, waiting 5 seconds...');
        await Bun.sleep(5000);
        continue;
      }
      
      console.log(`📋 Found ${records.length} records, dispatching to ${availableWorkers} available workers`);
      
      totalJobs += records.length;
      
      // Start processing records without waiting for completion
      for (const record of records) {
        processRecord(record); // Don't await - let it run concurrently
      }
      
      // Small delay before next poll
      await Bun.sleep(1000);
      
    } catch (error) {
      console.error('❌ Error in main processing loop:', error);
      console.log('⏳ Waiting 10 seconds before retrying...');
      await Bun.sleep(10000);
    }
  }
}



// Create status function for monitoring
function getMonitoringStatus() {
  return {
    workers: {
      active: workerSemaphore.currentCount,
      max: MAX_WORKERS,
      queued: workerSemaphore.waitingQueue.length,
      available: MAX_WORKERS - workerSemaphore.currentCount
    },
    jobs: {
      processed: jobsProcessed,
      total: totalJobs,
      inProgress: activeWorkers.size
    },
    activeWorkers: Array.from(activeWorkers.entries()).map(([id, worker]) => ({
      id,
      recordId: worker.record.id,
      repoUrl: worker.record.repo_url,
      demoUrl: worker.record.play_url,
      status: worker.status,
      startTime: worker.startTime,
      duration: Date.now() - worker.startTime.getTime()
    })),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
}

// Start the nexus
async function main() {
  server = createMonitoringServer(getMonitoringStatus);
  await startNexus();
}

main().catch((error) => {
  console.error('❌ Failed to start nexus:', error);
  process.exit(1);
});
