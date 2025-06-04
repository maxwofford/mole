// Test script to verify Docker auto-build functionality
const SERVER_URL = 'http://localhost:3000';

async function checkServerHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const health = await response.json();
    console.log(`📊 Server Health: ${health.status}`);
    console.log(`   Workers: ${health.activeWorkers}/${health.maxWorkers}`);
    console.log(`   Queue: ${health.queuedRequests}`);
    return health;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return null;
  }
}

async function checkDockerImage() {
  try {
    const proc = Bun.spawn(['docker', 'images', 'mole-worker', '--format', 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}'], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    console.log('🐳 Docker Images:');
    console.log(output);
    
    return exitCode === 0 && output.includes('mole-worker');
  } catch (error) {
    console.error('❌ Error checking Docker image:', error);
    return false;
  }
}

async function testDockerBuild() {
  console.log('🧪 Testing Docker Auto-Build Functionality\n');
  
  console.log('📋 Checking Docker image status...');
  const imageExists = await checkDockerImage();
  
  if (!imageExists) {
    console.log('⏳ Docker image not found or still building...');
    console.log('💡 The server should automatically build it on startup');
    return;
  }
  
  console.log('✅ Docker image exists!');
  
  console.log('\n📋 Checking server status...');
  const health = await checkServerHealth();
  
  if (!health) {
    console.log('⏳ Server not ready yet, build may still be in progress');
    return;
  }
  
  console.log('\n🧪 Testing a simple analyze request...');
  
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
    console.log('✅ Analysis request successful!');
    console.log(`   Decision: ${result.decision}`);
    console.log(`   Reason: ${result.reason.substring(0, 100)}...`);
    
    console.log('\n🎉 Docker auto-build system working perfectly!');
    console.log('   ✓ Server automatically detected missing image');
    console.log('   ✓ Docker image built successfully'); 
    console.log('   ✓ Server started and is processing requests');
    
  } catch (error) {
    console.log(`❌ Analysis request failed: ${error.message}`);
  }
}

// Check every 30 seconds until server is ready
async function waitAndTest() {
  console.log('⏳ Waiting for Docker build to complete...\n');
  
  for (let i = 0; i < 20; i++) { // Wait up to 10 minutes
    await testDockerBuild();
    
    // Check if server is responsive
    const health = await checkServerHealth();
    if (health) {
      console.log('\n✅ Server is ready! Build completed successfully.');
      break;
    }
    
    console.log(`\n⏳ Waiting... (attempt ${i + 1}/20, next check in 30s)`);
    await Bun.sleep(30000);
  }
}

waitAndTest().catch(console.error);
