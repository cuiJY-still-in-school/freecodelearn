import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(true);
  const [selectedModel, setSelectedModel] = useState('simple');
  const [serviceStatus, setServiceStatus] = useState({ ai: false, backend: false });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check service health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const aiRes = await fetch('http://localhost:8000/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        setServiceStatus(prev => ({ ...prev, ai: aiRes.ok }));
      } catch {
        setServiceStatus(prev => ({ ...prev, ai: false }));
      }
      
      try {
        const backendRes = await fetch('http://localhost:3000/health', {
          signal: AbortSignal.timeout(3000)
        });
        setServiceStatus(prev => ({ ...prev, backend: backendRes.ok }));
      } catch {
        setServiceStatus(prev => ({ ...prev, backend: false }));
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmedCommand = command.trim();
    if (!trimmedCommand || loading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: trimmedCommand,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setCommand('');
    setLoading(true);

    try {
      const aiResponse = await fetch(`http://localhost:8000/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: trimmedCommand,
          model: selectedModel,
        }),
      });
      
      const data = await aiResponse.json();
      
      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: data.reasoning,
        toolCalls: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (autoExecute && data.tool_calls && data.tool_calls.length > 0) {
        for (const toolCall of data.tool_calls) {
          try {
            const toolResponse = await fetch(`http://localhost:3000/tools/${toolCall.tool_name}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(toolCall.parameters),
            });
            const toolData = await toolResponse.json();
            
            aiMessage.toolCalls.push({
              name: toolCall.tool_name,
              parameters: toolCall.parameters,
              success: toolData.success,
              output: toolData.output,
              error: toolData.error,
            });
          } catch (toolError) {
            aiMessage.toolCalls.push({
              name: toolCall.tool_name,
              parameters: toolCall.parameters,
              success: false,
              error: toolError.message,
            });
          }
        }
      } else if (data.tool_calls && data.tool_calls.length > 0) {
        aiMessage.toolCalls = data.tool_calls.map(tc => ({
          name: tc.tool_name,
          parameters: tc.parameters,
          pending: true,
        }));
      }

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'ai',
        content: `连接失败：${error.message}`,
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startNewChat = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  const useExample = (text) => {
    setCommand(text);
    inputRef.current?.focus();
  };

  const examples = [
    { icon: '📄', text: '列出所有 Markdown 文件' },
    { icon: '📖', text: '读取 README.md 内容' },
    { icon: '💻', text: '运行 echo Hello SkyFly' },
    { icon: '✏️', text: '创建文件 /tmp/test.txt，内容为 Hello World' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🚀</span>
            <span>SkyFly</span>
          </div>
          <button className="new-chat-btn" onClick={startNewChat}>
            <span>+</span>
            <span>新对话</span>
          </button>
        </div>

        <div className="sidebar-content">
          <div className="settings-section">
            <h3>AI 模型</h3>
            <select 
              className="model-select" 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="simple">🧪 简单规则引擎（本地）</option>
              <option value="openai">🤖 OpenAI GPT-4</option>
              <option value="deepseek">🐋 DeepSeek V3</option>
              <option value="kimi">🌙 Kimi K2</option>
              <option value="custom">⚙️ 自定义 API</option>
            </select>
          </div>

          <div className="settings-section">
            <h3>设置</h3>
            <div className="toggle-group">
              <label className="toggle-item">
                <span>自动执行工具</span>
                <div 
                  className={`toggle-switch ${autoExecute ? 'active' : ''}`}
                  onClick={() => setAutoExecute(!autoExecute)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div>AI: {serviceStatus.ai ? '🟢 在线' : '🔴 离线'}</div>
          <div>后端: {serviceStatus.backend ? '🟢 在线' : '🔴 离线'}</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="chat-header">
          <span className="chat-header-title">SkyFly AI 自动化助手</span>
          <div className="chat-header-info">
            <span className="status-indicator">
              <span className={`status-dot ${serviceStatus.ai ? '' : 'offline'}`}></span>
              {selectedModel === 'simple' ? '本地模式' : selectedModel}
            </span>
          </div>
        </header>

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon">🚀</div>
              <h1 className="welcome-title">SkyFly AI Automation</h1>
              <p className="welcome-subtitle">
                用自然语言描述你想完成的任务，SkyFly 会智能分析并自动执行。
                <br />
                支持文件操作、系统命令、网络请求等多种工具。
              </p>
              <div className="quick-actions">
                {examples.map((ex, i) => (
                  <button 
                    key={i} 
                    className="quick-action-btn"
                    onClick={() => useExample(ex.text)}
                  >
                    <span className="quick-action-icon">{ex.icon}</span>
                    <span>{ex.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.type}`}>
                  <div className="message-avatar">
                    {msg.type === 'user' ? '👤' : msg.isError ? '⚠️' : '🤖'}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-author">
                        {msg.type === 'user' ? '你' : msg.isError ? '系统' : 'SkyFly AI'}
                      </span>
                      <span className="message-time">{msg.timestamp}</span>
                    </div>
                    <div className={`message-text ${msg.isError ? 'error-text' : ''}`}>
                      {msg.content}
                    </div>
                    {msg.toolCalls && msg.toolCalls.map((tool, i) => (
                      <div key={i} className="tool-call">
                        <div className="tool-call-header">
                          <span>🔧</span>
                          <span>工具调用: {tool.name}</span>
                        </div>
                        <div className={`tool-result ${tool.success ? 'success' : tool.error ? 'error' : ''}`}>
                          <strong>参数:</strong> {JSON.stringify(tool.parameters, null, 2)}
                          {tool.output && (
                            <>
                              {'\n\n'}<strong>输出:</strong>{'\n'}{cleanOutput(tool.output)}
                            </>
                          )}
                          {tool.error && (
                            <>
                              {'\n\n'}<strong>错误:</strong>{'\n'}{tool.error}
                            </>
                          )}
                          {tool.pending && (
                            <>
                              {'\n\n'}<em>⏳ 等待执行...</em>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="loading-indicator">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span>AI 正在思考...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="input-container">
          <form onSubmit={handleSubmit} className="input-wrapper">
            <textarea
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入自然语言命令，例如：列出当前目录下的所有文件..."
              rows={1}
              className="chat-input"
              disabled={loading}
            />
            <div className="input-actions">
              <span className="input-hint">按 Enter 发送，Shift + Enter 换行</span>
              <button 
                type="submit" 
                className="send-button"
                disabled={loading || !command.trim()}
              >
                ➤
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function cleanOutput(output) {
  // Remove ANSI color codes and log prefixes
  return output
    .replace(/\u001b\[\d+m/g, '')
    .replace(/\u001b\[\d+;\d+m/g, '')
    .replace(/\u001b\[0m/g, '')
    .replace(/^\s*[\d-]+T[\d:]+Z\s+INFO\s+[^:]+:\s+/gm, '')
    .replace(/^\s*Success: true\s*$/gm, '')
    .replace(/^\s*Tool '[^']+' completed successfully\s*$/gm, '')
    .trim();
}

export default App;
