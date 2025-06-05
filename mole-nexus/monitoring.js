// HTTP monitoring endpoints and web dashboard for mole-nexus

function createMonitoringServer(getStatus) {
  const port = parseInt(process.env.MONITORING_PORT) || 3001;
  
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      
      // CORS headers for local development
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      
      if (req.method === 'OPTIONS') {
        return new Response(null, { headers });
      }
      
      if (url.pathname === '/api/status') {
        const status = getStatus();
        
        return new Response(JSON.stringify(status, null, 2), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = getMonitoringHTML();
        
        return new Response(html, {
          headers: { ...headers, 'Content-Type': 'text/html' }
        });
      }
      
      return new Response('Not Found', { status: 404, headers });
    }
  });
  
  console.log(`🌐 Monitoring dashboard available at http://localhost:${port}`);
  return server;
}

function getMonitoringHTML() {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Mole Nexus Monitoring</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5; 
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #2563eb; }
        .stat-label { color: #6b7280; margin-top: 5px; }
        .workers-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .worker-item { 
            padding: 15px; 
            border: 1px solid #e5e7eb; 
            border-radius: 6px; 
            margin-bottom: 10px; 
            background: #f9fafb; 
        }
        .worker-status { 
            display: inline-block; 
            padding: 3px 8px; 
            border-radius: 12px; 
            font-size: 0.8em; 
            font-weight: 500; 
        }
        .status-analyzing { background: #fef3c7; color: #92400e; }
        .status-updating { background: #dbeafe; color: #1e40af; }
        .duration { color: #6b7280; font-size: 0.9em; }
        .repo-url { color: #059669; text-decoration: none; font-family: monospace; }
        .repo-url:hover { text-decoration: underline; }
        .refresh { margin-left: auto; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 8px; cursor: pointer; }
        .refresh:hover { background: #e5e7eb; }
        h1 { margin: 0; color: #1f2937; }
        h2 { color: #374151; margin-top: 0; display: flex; align-items: center; }
        .no-workers { color: #6b7280; font-style: italic; text-align: center; padding: 20px; }
        .last-updated { color: #9ca3af; font-size: 0.8em; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦫 Mole Nexus Monitoring</h1>
            <p>Real-time status of hackathon project analysis workers</p>
            <div class="last-updated" id="lastUpdated"></div>
        </div>
        
        <div class="stats" id="stats">
            <!-- Stats will be populated by JavaScript -->
        </div>
        
        <div class="workers-section">
            <h2>Active Workers <button class="refresh" onclick="fetchStatus()">🔄 Refresh</button></h2>
            <div id="workers">
                <!-- Workers will be populated by JavaScript -->
            </div>
        </div>
    </div>
    
    <script>
        function formatDuration(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
            if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
            return seconds + 's';
        }
        
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (hours > 0) return hours + 'h ' + minutes + 'm';
            if (minutes > 0) return minutes + 'm ' + secs + 's';
            return secs + 's';
        }
        
        async function fetchStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                // Update stats
                document.getElementById('stats').innerHTML = \`
                    <div class="stat-card">
                        <div class="stat-value">\${data.workers.active}/\${data.workers.max}</div>
                        <div class="stat-label">Active Workers</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${data.workers.queued}</div>
                        <div class="stat-label">Queued Jobs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${data.jobs.processed}</div>
                        <div class="stat-label">Jobs Processed</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${formatUptime(data.uptime)}</div>
                        <div class="stat-label">Uptime</div>
                    </div>
                \`;
                
                // Update workers
                const workersDiv = document.getElementById('workers');
                if (data.activeWorkers.length === 0) {
                    workersDiv.innerHTML = '<div class="no-workers">No active workers</div>';
                } else {
                    workersDiv.innerHTML = data.activeWorkers.map(worker => \`
                        <div class="worker-item">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>Record:</strong> \${worker.recordId} 
                                    <span class="worker-status status-\${worker.status}">\${worker.status}</span>
                                </div>
                                <div class="duration">\${formatDuration(worker.duration)}</div>
                            </div>
                            <div style="margin-top: 8px;">
                                <a href="\${worker.repoUrl}" target="_blank" class="repo-url">\${worker.repoUrl}</a>
                                \${worker.demoUrl ? \`<br><a href="\${worker.demoUrl}" target="_blank" class="repo-url">\${worker.demoUrl}</a>\` : ''}
                            </div>
                        </div>
                    \`).join('');
                }
                
                // Update last updated time
                document.getElementById('lastUpdated').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
                
                // Update page title
                document.title = \`Mole Nexus (\${data.workers.active} active)\`;
            } catch (error) {
                console.error('Failed to fetch status:', error);
                document.getElementById('lastUpdated').textContent = 'Failed to fetch data at ' + new Date().toLocaleTimeString();
            }
        }
        
        // Fetch status on load and every 2 seconds
        fetchStatus();
        setInterval(fetchStatus, 2000);
    </script>
</body>
</html>`;
}

export { createMonitoringServer };
