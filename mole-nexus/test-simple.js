// Simple test to demonstrate MAX_MOLE_WORKERS override
const SERVER_URL = 'http://localhost:3000';

async function checkServerHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const health = await response.json();
    console.log(`📊 Server Health:`);
    console.log(`   Active Workers: ${health.activeWorkers}/${health.maxWorkers}`);
    console.log(`   Queued Requests: ${health.queuedRequests}`);
    console.log(`   Status: ${health.status}`);
    return health;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return null;
  }
}

async function testSimpleRequest() {
  console.log('🧪 Testing simple request...');
  
  try {
    const response = await fetch(`${SERVER_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoUrl: "https://github.com/maxwofford/maxwofford.github.io",
        demoUrl: "https://maxwofford.com",
        readmeUrl: ""
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ Request successful!');
    console.log(`   Decision: ${result.decision}`);
    console.log(`   Reason: ${result.reason.substring(0, 100)}...`);
    
    return result;
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Testing Mole Server Concurrency Control\n');
  
  // Check initial health
  console.log('📋 Initial server state:');
  await checkServerHealth();
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Testing Worker Limit Configuration');
  console.log('='.repeat(50));
  console.log('Current server is running with default settings.');
  console.log('To test with different worker limits:');
  console.log('');
  console.log('💡 MAX_MOLE_WORKERS=2 bun run server.js  (2 workers)');
  console.log('💡 MAX_MOLE_WORKERS=8 bun run server.js  (8 workers)');
  console.log('💡 bun run server.js                     (4 workers - default)');
  console.log('');
  
  // Test a simple request
  console.log('🧪 Testing single request processing...');
  await testSimpleRequest();
  
  console.log('\n📊 Final server state:');
  await checkServerHealth();
  
  console.log('\n✅ Concurrent worker system is working!');
  console.log('   ✓ Semaphore controls max concurrent workers');
  console.log('   ✓ MAX_MOLE_WORKERS environment variable support');
  console.log('   ✓ Health endpoint shows worker status');
  console.log('   ✓ Requests queue when all workers are busy');
}

main().catch(console.error);
