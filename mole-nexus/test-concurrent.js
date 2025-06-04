// Test concurrent requests to the mole server
const SERVER_URL = 'http://localhost:3000';

// Test cases for concurrent testing
const testCases = [
  {
    name: "Test 1 - maxwofford.github.io",
    repoUrl: "https://github.com/maxwofford/maxwofford.github.io",
    demoUrl: "https://maxwofford.com",
    readmeUrl: ""
  },
  {
    name: "Test 2 - echospace", 
    repoUrl: "https://github.com/SrIzan10/echospace",
    demoUrl: null,
    readmeUrl: null
  },
  {
    name: "Test 3 - maxwofford.github.io (duplicate)",
    repoUrl: "https://github.com/maxwofford/maxwofford.github.io",
    demoUrl: "https://maxwofford.com", 
    readmeUrl: ""
  },
  {
    name: "Test 4 - echospace (duplicate)",
    repoUrl: "https://github.com/SrIzan10/echospace",
    demoUrl: null,
    readmeUrl: null
  }
];

async function analyzeProject(testCase) {
  const startTime = Date.now();
  console.log(`🚀 Starting ${testCase.name}`);
  
  try {
    const response = await fetch(`${SERVER_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoUrl: testCase.repoUrl,
        demoUrl: testCase.demoUrl,
        readmeUrl: testCase.readmeUrl
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${testCase.name} completed in ${duration}ms`);
    console.log(`   Decision: ${result.decision}`);
    console.log(`   Reason: ${result.reason.substring(0, 100)}...`);
    
    return { testCase, result, duration, success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${testCase.name} failed after ${duration}ms: ${error.message}`);
    return { testCase, error: error.message, duration, success: false };
  }
}

async function checkServerHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const health = await response.json();
    console.log(`📊 Server Health: ${health.activeWorkers}/${health.maxWorkers} workers active, ${health.queuedRequests} queued`);
    return health;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return null;
  }
}

async function runConcurrentTest() {
  console.log('🧪 Starting concurrent server test...\n');
  
  // Check initial server health
  await checkServerHealth();
  
  console.log(`\n🚀 Launching ${testCases.length} concurrent requests...\n`);
  
  const startTime = Date.now();
  
  // Launch all requests concurrently
  const promises = testCases.map(testCase => analyzeProject(testCase));
  
  // Wait for all to complete
  const results = await Promise.all(promises);
  
  const totalDuration = Date.now() - startTime;
  
  console.log('\n📊 Concurrent Test Results:');
  console.log('=' .repeat(50));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`⏱️  Total time: ${totalDuration}ms`);
  console.log(`⚡ Average time per request: ${Math.round(totalDuration / results.length)}ms`);
  
  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    console.log(`📈 Average successful request time: ${Math.round(avgDuration)}ms`);
  }
  
  // Final health check
  console.log('\n📊 Final server state:');
  await checkServerHealth();
  
  // Show results summary
  console.log('\n📋 Detailed Results:');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.testCase.name}: ${result.duration}ms`);
    if (result.success) {
      console.log(`    → ${result.result.decision}`);
    } else {
      console.log(`    → Error: ${result.error}`);
    }
  });
}

// Check if server is running first
async function main() {
  console.log('🔍 Checking if server is running...');
  const health = await checkServerHealth();
  
  if (!health) {
    console.log('❌ Server is not running. Please start it with: bun run server.js');
    process.exit(1);
  }
  
  console.log('✅ Server is running and healthy!');
  await runConcurrentTest();
}

main().catch(console.error);
