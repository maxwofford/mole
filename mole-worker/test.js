import { analyzeHackathonProject } from './worker.js'

// Test cases with real-world URLs
const testCases = [
  {
    name: "maxwofford/maxwofford.github.io - infers readme should pass",
    repoUrl: "https://github.com/maxwofford/maxwofford.github.io",
    demoUrl: "https://maxwofford.com",
    readmeUrl: "", // Let it infer
    expectedDecision: "true"
  },
  {
    name: "divpreeet/Desky - should fail due to unjustified video",
    repoUrl: "https://github.com/divpreeet/Desky",
    demoUrl: "https://cloud-mkotu7vhy-hack-club-bot.vercel.app/0rpreplay_final1734758222.mp4",
    expectedDecision: "false"
  },
  {
    name: "https://github.com/AdamEXu/SneakySave - missing readme should fail",
    repoUrl: "https://github.com/AdamEXu/SneakySave",
    demoUrl: "https://sneakysave.vercel.app/",
    readmeUrl: "",
    expectedDecision: "false"
  },
  {
    name: "https://github.com/SrIzan10/echospace - infer project link should pass",
    repoUrl: "https://github.com/SrIzan10/echospace",
    demoUrl: null,
    readmeUrl: null,
    expectedDecision: "true"
  },
]

async function runTests() {
  console.log("Starting worker tests...\n")
  
  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`)
    console.log(`   Repo: ${testCase.repoUrl}`)
    console.log(`   Demo: ${testCase.demoUrl}`)
    
    try {
      const result = await analyzeHackathonProject(
        testCase.repoUrl,
        testCase.demoUrl,
        testCase.readmeUrl
      )
      
      const passed = result.decision === testCase.expectedDecision
      const status = passed ? "✅ PASS" : "❌ FAIL"
      
      console.log(`   Result: ${status}`)
      console.log(`   Decision: ${result.decision}`)
      console.log(`   Reason: ${result.reason}`)
      
      if (!passed) {
        console.log(`   Expected: ${testCase.expectedDecision}`)
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`)
    }
    
    console.log()
  }
}

runTests().catch(console.error)
