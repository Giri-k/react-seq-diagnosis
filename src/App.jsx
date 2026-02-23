import React, { useState, useRef, useEffect } from 'react';
import {
  Stethoscope,
  Send,
  Activity,
  User,
  Bot,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Clock,
  FlaskConical,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import './App.css';

const AgentIcon = ({ name }) => {
  if (name?.includes('Challenger')) return <FlaskConical className="agent-icon icon-challenger" />;
  if (name?.includes('Stewardship')) return <CreditCard className="agent-icon icon-stewardship" />;
  if (name?.includes('Specialist')) return <Stethoscope className="agent-icon icon-specialist" />;
  if (name?.includes('Orchestrator')) return <Bot className="agent-icon icon-orchestrator" />;
  return <Bot className="agent-icon icon-default" />;
};

function App() {
  const [inputs, setInputs] = useState({
    initial_info: '',
    full_case: '',
    ground_truth: ''
  });
  const [messages, setMessages] = useState([]);
  const [differential, setDifferential] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const chatEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const startDiagnosis = async () => {
    if (!inputs.initial_info || !inputs.full_case) {
      setError("Please fill in the required fields.");
      return;
    }

    setError(null);
    setIsStreaming(true);
    setMessages([]);
    setDifferential(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('http://localhost:8000/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputs),
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentAgentName = null;
      let lastMessageId = null;
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          // Strip ANSI escape codes (color codes)
          const cleanAnsi = (str) => str.replace(/\u001b\[[0-9;]*m/g, '');
          const content = cleanAnsi(trimmedLine.slice(6).trim());
          if (!content) continue;

          // Differential Diagnosis detection (Specific to our new backend log)
          if (content.includes('📊 Differential Diagnosis Updated') || content.includes('Differential Diagnosis (Text Parser)')) {
            // Simple parsing for the top diagnosis
            const dxMatch = content.match(/- ([^:]+): (\d+)%/);
            if (dxMatch) {
              setDifferential({
                diagnosis: dxMatch[1],
                probability: dxMatch[2] + '%',
                full: content.split('Updated:')[1] || content
              });
            }
          }

          // Agent detection
          const agentMatch = content.match(/Agent Name ([^\[│╮ ]+(?:\s+[^\[│╮ ]+)*)/);
          if (agentMatch) {
            const agentName = agentMatch[1].trim();
            if (currentAgentName !== agentName) {
              currentAgentName = agentName;
              lastMessageId = Date.now() + Math.random();

              setMessages(prev => [...prev, {
                id: lastMessageId,
                agent: agentName,
                content: '',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }]);
            }
            continue;
          }

          // Status detection: Emojis anywhere in the first few characters
          const isStatus = content.match(/^.{0,5}[🤔💰🩺🔬🧠🤝✅🏁⭐❌📊📈📉🏥🧬🧪]/);

          if (isStatus && content.length < 150 && !content.includes('Agent Name')) {
            setMessages(prev => [...prev, {
              id: Date.now() + Math.random(),
              status: content,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
            continue;
          }

          // Content accumulation - Default to Orchestrator if no agent is active
          if (!currentAgentName) {
            currentAgentName = 'System Orchestrator';
            lastMessageId = 'system-' + Date.now();
            setMessages(prev => [...prev, {
              id: lastMessageId,
              agent: currentAgentName,
              content: '',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
          }

          let cleanContent = content.replace(/[╭╮╯╰─│]/g, '');

          // If the line was just a box border, skip it
          if (!cleanContent.replace(/[\s\-_]/g, '').length) continue;

          cleanContent = cleanContent.trim();

          if (cleanContent) {
            setMessages(prev => {
              const newMessages = [...prev];
              const msgIndex = newMessages.findIndex(m => m.id === lastMessageId);
              if (msgIndex !== -1) {
                const existingContent = newMessages[msgIndex].content;
                const lines = existingContent.split('\n');
                if (lines[lines.length - 1] !== cleanContent) {
                  newMessages[msgIndex].content = existingContent
                    ? `${existingContent}\n${cleanContent}`
                    : cleanContent;
                }
              }
              return newMessages;
            });
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => [...prev, {
          id: Date.now(),
          status: '🏁 Process stopped by user.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } else {
        setError(`Failed to connect to backend: ${err.message}`);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopDiagnosis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="logo">
          <Activity className="logo-icon" />
          <h1>SeqDiagnosis <span className="logo-badge">Pro</span></h1>
        </div>
        <div className="header-actions">
          <div className="status-indicator">
            <div className={`status-dot ${isStreaming ? 'pulse' : ''}`}></div>
            <span>{isStreaming ? 'Orchestrating Agents...' : 'System Ready'}</span>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="input-section">
          <div className="glass-card">
            <div className="card-header">
              <Stethoscope className="header-icon" />
              <h2>New Diagnosis Case</h2>
            </div>

            <div className="form-group">
              <label>Initial Information</label>
              <textarea
                name="initial_info"
                placeholder="e.g. Patient presents with severe sore throat for 3 days..."
                value={inputs.initial_info}
                onChange={handleInputChange}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Full Case Details</label>
              <textarea
                name="full_case"
                placeholder="Detailed medical history, symptoms, and findings..."
                value={inputs.full_case}
                onChange={handleInputChange}
                rows={5}
              />
            </div>

            <div className="form-group">
              <label>Ground Truth (Optional)</label>
              <input
                type="text"
                name="ground_truth"
                placeholder="Hidden answer for validation..."
                value={inputs.ground_truth}
                onChange={handleInputChange}
              />
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {isStreaming ? (
              <button
                className="stop-btn"
                onClick={stopDiagnosis}
              >
                <Activity size={18} className="stop-icon" />
                Stop Diagnosis
              </button>
            ) : (
              <button
                className="diagnose-btn"
                onClick={startDiagnosis}
              >
                <Sparkles size={18} />
                Run Sequence Diagnosis
              </button>
            )}
          </div>
        </section>

        <section className="chat-section">
          <AnimatePresence>
            {differential && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="differential-banner"
              >
                <div className="diff-header">
                  <div className="diff-title">
                    <Activity size={16} className="pulse-slow" />
                    <span>Current Leading Hypothesis</span>
                  </div>
                  <div className="diff-stats">
                    <span className="prob-badge">{differential.probability} Confidence</span>
                  </div>
                </div>
                <div className="diff-content">
                  <span className="dx-label">Diagnosis:</span>
                  <span className="dx-value">{differential.diagnosis}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="chat-container">
            <AnimatePresence>
              {messages.length === 0 && !isStreaming ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="empty-state"
                >
                  <Bot size={48} className="empty-icon" />
                  <h3>Agent Orchestration</h3>
                  <p>Start a diagnosis to see how our AI agents collaborate and challenge each other to find the best medical outcome.</p>
                </motion.div>
              ) : (
                <div className="message-list">
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`message-wrapper ${msg.status ? 'status-msg' : 'agent-msg'}`}
                    >
                      {msg.status ? (
                        <div className="status-bubble">
                          <span className="timestamp">{msg.timestamp}</span>
                          <span className="status-text">{msg.status}</span>
                        </div>
                      ) : (
                        <div className="agent-bubble">
                          <div className="agent-header">
                            <AgentIcon name={msg.agent} />
                            <span className="agent-name">{msg.agent}</span>
                            <span className="timestamp">{msg.timestamp}</span>
                          </div>
                          <div className="agent-body">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
