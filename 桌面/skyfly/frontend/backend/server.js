const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'skyfly-backend',
    version: '0.1.0'
  });
});

// Execute Rust tool
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const parameters = req.body;

  try {
    // Build command arguments
    const args = [toolName];
    for (const [key, value] of Object.entries(parameters)) {
      args.push(`-p`, `${key}=${value}`);
    }

    // Execute Rust binary
    const rustBinary = path.join(__dirname, '../../rust-core/target/release/skyfly-core');
    const child = spawn(rustBinary, ['execute', ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          output: stdout,
          error: stderr || null
        });
      } else {
        res.status(500).json({
          success: false,
          output: stdout,
          error: stderr || `Process exited with code ${code}`
        });
      }
    });

    child.on('error', (error) => {
      console.error('Failed to execute Rust binary:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });

  } catch (error) {
    console.error('Error executing tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Proxy to AI service
app.use('/ai', createProxy('http://localhost:8000'));

function createProxy(target) {
  return express.Router().use('/', (req, res) => {
    const targetUrl = new URL(req.originalUrl, target);
    
    fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => res.json(data))
    .catch(error => {
      console.error('Proxy error:', error);
      res.status(500).json({ 
        error: 'Failed to reach AI service',
        message: error.message 
      });
    });
  });
}

app.listen(PORT, () => {
  console.log(`🚀 SkyFly Backend Server running on http://localhost:${PORT}`);
  console.log(`📊 Rust Core: ../../rust-core/target/release/skyfly-core`);
  console.log(`🤖 AI Service: http://localhost:8000`);
});
