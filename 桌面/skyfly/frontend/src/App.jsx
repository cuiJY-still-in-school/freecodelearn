import React, { useState } from 'react';
import './App.css';

function App() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse('');

    try {
      // Get AI response
      const aiResponse = await fetch(`http://localhost:8000/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_input: command,
        }),
      });
      
      const data = await aiResponse.json();
      
      if (autoExecute && data.tool_calls && data.tool_calls.length > 0) {
        // Execute tool calls through Rust core
        let fullResponse = `✅ AI Analysis:\n${data.reasoning}\n\n🔧 Executing ${data.tool_calls.length} tool(s):\n`;
        
        for (const toolCall of data.tool_calls) {
          try {
            const toolResponse = await fetch(`http://localhost:3000/tools/${toolCall.tool_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(toolCall.parameters),
            });
            const toolData = await toolResponse.json();
            
            fullResponse += `\n📋 Tool '${toolCall.tool_name}':\n`;
            fullResponse += `  Success: ${toolData.success}\n`;
            fullResponse += `  Output: ${toolData.output || 'No output'}\n`;
            if (toolData.error) {
              fullResponse += `  Error: ${toolData.error}\n`;
            }
          } catch (toolError) {
            fullResponse += `\n❌ Failed to execute '${toolCall.tool_name}': ${toolError.message}\n`;
          }
        }
        
        setResponse(fullResponse);
      } else {
        // Just show the AI response
        setResponse(`✅ AI Response:\n\nReasoning: ${data.reasoning}\n\nTool Calls:\n${JSON.stringify(data.tool_calls, null, 2)}`);
      }
    } catch (error) {
      setResponse(`❌ Error: ${error.message}\n\nMake sure the AI service is running on http://localhost:8000\nStart it with: cd python-ai && source .venv/bin/activate && python -m app.simple_service`);
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      const data = await response.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(`Error checking AI service: ${error.message}`);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚀 SkyFly AI Automation</h1>
        <p>Natural language task processing with automated execution</p>
      </header>

      <div className="controls">
        <button 
          className="control-button"
          onClick={handleHealthCheck}
        >
          Check AI Service Health
        </button>
        
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={autoExecute}
            onChange={(e) => setAutoExecute(e.target.checked)}
          />
          Auto-execute tools
        </label>
      </div>

      <div className="main-content">
        <form onSubmit={handleSubmit} className="command-form">
          <div className="form-group">
            <label htmlFor="command">Natural Language Command</label>
            <textarea
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g., 'list all markdown files' or 'read file README.md'"
              rows={3}
              className="command-input"
            />
          </div>
          
          <button 
            type="submit" 
            className="submit-button"
            disabled={loading || !command.trim()}
          >
            {loading ? 'Processing...' : 'Submit Command'}
          </button>
        </form>

        {response && (
          <div className="response-area">
            <h2>Response</h2>
            <pre className="response-text">{response}</pre>
          </div>
        )}
      </div>

      <div className="examples">
        <h2>Example Commands</h2>
        <ul>
          <li>list *.md files</li>
          <li>read file README.md</li>
          <li>echo Hello from SkyFly</li>
          <li>write file /tmp/test.txt with content "Hello World"</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
