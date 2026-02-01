import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'

const EditorPage = () => {
  const [code, setCode] = useState(
    '// Write your code here\nfunction reverseString(str) {\n  // Your solution\n}\n'
  )
  const [output, setOutput] = useState('')
  const [isOutputOpen, setIsOutputOpen] = useState(false)
  const [rightPanelView, setRightPanelView] = useState('assistant')
  const [language, setLanguage] = useState('javascript')

  const [searchParams] = useSearchParams()
  const partId = searchParams.get('partId')

  // Chat state
  const [messages, setMessages] = useState([])
  const [userInput, setUserInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState(null)
  const chatContainerRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return

    const threshold = 80 // px
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isNearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleRun = async () => {
    setIsOutputOpen(true)
    setOutput('> Preparing execution request...')

    // Construct payload
    // "Language is cpp if c++ is selected" -> Mapping logic
    let lang = language
    if (language === 'cpp' || language === 'c++') {
      lang = 'cpp'
    }

    const payload = {
      project_id: partId || "default_project",
      language: lang,
      stdin_args: "",
      code: code
    }
    console.log("Execution Payload:", payload)

    console.log("Execution Payload:", payload)

    try {
      const response = await fetch('http://localhost:8000/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log("Execution Response:", data)

      // Assuming reponse might correspond to stdout or similar. 
      // Adjust based on actual server response structure. 
      // For now, dumping the JSON.
      setOutput(`> Request sent successfully!\n\nResponse:\n${JSON.stringify(data, null, 2)}`)

    } catch (err) {
      console.error("Execution failed:", err)
      setOutput(`> Execution failed: ${err.message}`)
    }
  }

  const toggleOutput = () => {
    setIsOutputOpen(!isOutputOpen)
  }

  const sendMessage = async () => {
    if (!userInput.trim() || isSending) return

    const userMessage = {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    }

    setMessages((prev) => [...prev, userMessage])
    const messageToSend = userInput
    setUserInput('')
    setIsSending(true)
    setError(null)

    const requestBody = {
      text_from_user: messageToSend,
      code: code || '',
      project_description: 'Code editor practice problem'
    }

    console.log('=== CHAT DEBUG INFO ===')
    console.log('1. Request URL:', 'http://localhost:8000/ai/tutor')
    console.log('2. Request Method:', 'POST')
    console.log('3. Request Body:', JSON.stringify(requestBody, null, 2))
    console.log('4. Headers:', { 'Content-Type': 'application/json' })

    try {
      const response = await fetch('http://localhost:8000/ai/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      console.log('5. Response Status:', response.status, response.statusText)
      console.log('6. Response Headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        let errorData
        const contentType = response.headers.get('content-type')

        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json()
        } else {
          const textError = await response.text()
          errorData = { detail: textError }
        }

        console.error('7. ERROR Response Body:', errorData)

        let errorMsg = `HTTP ${response.status}: `
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg += errorData.detail
          } else if (Array.isArray(errorData.detail)) {
            // Pydantic validation errors
            errorMsg += errorData.detail
              .map((err) => `${err.loc?.join('.')} - ${err.msg}`)
              .join(', ')
          } else {
            errorMsg += JSON.stringify(errorData.detail)
          }
        } else {
          errorMsg += response.statusText || 'Unknown error'
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      console.log('8. Success! Response:', data)

      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error('9. CATCH ERROR:', err)
      const errorMessage = err.message || 'Failed to send message'
      setError(errorMessage)
    } finally {
      setIsSending(false)
      console.log('=== END DEBUG INFO ===')
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '60px',
          backgroundColor: '#1e293b',
          borderBottom: '2px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Code Editor</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            style={{
              padding: '10px 24px',
              backgroundColor: '#334155',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = '#475569')}
            onMouseOut={(e) => (e.target.style.backgroundColor = '#334155')}
          >
            ← Return to Dashboard
          </button>
          <button
            onClick={() => {
              alert('Problem marked as completed!')
              // TODO: Save completion status to backend
            }}
            style={{
              padding: '10px 24px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = '#059669')}
            onMouseOut={(e) => (e.target.style.backgroundColor = '#10b981')}
          >
            ✓ Mark as Completed
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0
        }}
      >
        {/* Top Section: Code + Assistant/PDF */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '13fr 7fr',
            gap: '0',
            overflow: 'hidden',
            minHeight: 0, // IMPORTANT for inner scroll areas
            minWidth: 0
          }}
        >
          {/* Panel 1: CODE */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRight: '2px solid #334155',
              backgroundColor: '#0f172a',
              minWidth: 0,
              minHeight: 0
            }}
          >
            <div
              style={{
                height: '50px',
                backgroundColor: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                fontSize: '14px',
                fontWeight: 600,
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
                  onBlur={(e) => (e.target.style.borderColor = '#334155')}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleRun}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: '#38bdf8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => (e.target.style.backgroundColor = '#0ea5e9')}
                  onMouseOut={(e) => (e.target.style.backgroundColor = '#38bdf8')}
                >
                  ▶ Run
                </button>
                <button
                  onClick={toggleOutput}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: isOutputOpen ? '#818cf8' : '#475569',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => (e.target.style.opacity = '0.8')}
                  onMouseOut={(e) => (e.target.style.opacity = '1')}
                >
                  {isOutputOpen ? '▼ Hide' : '▲ Output'}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={(value) => setCode(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  padding: { top: 16, bottom: 16 }
                }}
              />
            </div>
          </div>

          {/* Panel 2: ASSISTANT / PDF VIEWER */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0f172a',
              minWidth: 0,
              minHeight: 0
            }}
          >
            {/* Tab Switcher */}
            <div
              style={{
                height: '50px',
                backgroundColor: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: '0'
              }}
            >
              <button
                onClick={() => setRightPanelView('assistant')}
                style={{
                  flex: 1,
                  height: '100%',
                  backgroundColor: rightPanelView === 'assistant' ? '#0f172a' : 'transparent',
                  color: rightPanelView === 'assistant' ? '#f8fafc' : '#94a3b8',
                  border: 'none',
                  borderBottom:
                    rightPanelView === 'assistant'
                      ? '2px solid #38bdf8'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '18px' }}>💬</span>
                <span>Assistant</span>
              </button>
              <button
                onClick={() => setRightPanelView('pdf')}
                style={{
                  flex: 1,
                  height: '100%',
                  backgroundColor: rightPanelView === 'pdf' ? '#0f172a' : 'transparent',
                  color: rightPanelView === 'pdf' ? '#f8fafc' : '#94a3b8',
                  border: 'none',
                  borderBottom:
                    rightPanelView === 'pdf' ? '2px solid #38bdf8' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '18px' }}>📄</span>
                <span>PDF View</span>
              </button>
            </div>

            {/* Content Area */}
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0, // IMPORTANT
                minWidth: 0
              }}
            >
              {rightPanelView === 'assistant' ? (
                // ASSISTANT VIEW - Chat Only
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#0f172a',
                    minHeight: 0, // IMPORTANT
                    minWidth: 0
                  }}
                >
                  {/* Chat History (Scrollable) */}
                  <div
                    ref={chatContainerRef}
                    style={{
                      flex: 1,
                      minHeight: 0, // IMPORTANT
                      minWidth: 0,
                      padding: '20px',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {messages.length === 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#64748b',
                          fontSize: '14px',
                          textAlign: 'center',
                          padding: '40px 0'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '48px', marginBottom: '12px' }}>💬</div>
                          <p style={{ margin: 0 }}>Start a conversation with the assistant</p>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              backgroundColor: msg.role === 'user' ? '#38bdf8' : '#1e293b',
                              color: '#f8fafc',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              wordWrap: 'break-word',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}

                    {isSending && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: '12px',
                            backgroundColor: '#1e293b',
                            color: '#94a3b8',
                            fontSize: '13px'
                          }}
                        >
                          Thinking...
                        </div>
                      </div>
                    )}

                    {error && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#7f1d1d',
                          color: '#fecaca',
                          fontSize: '12px',
                          textAlign: 'center'
                        }}
                      >
                        ⚠️ {error}
                      </div>
                    )}
                  </div>

                  {/* Chat Input (Fixed at bottom) */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: '#1e293b',
                      borderTop: '1px solid #334155'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Ask me anything..."
                        disabled={isSending}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          fontSize: '13px',
                          outline: 'none',
                          opacity: isSending ? 0.6 : 1
                        }}
                        onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
                        onBlur={(e) => (e.target.style.borderColor = '#334155')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSending) sendMessage()
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={isSending || !userInput.trim()}
                        style={{
                          padding: '10px 20px',
                          backgroundColor:
                            isSending || !userInput.trim() ? '#475569' : '#38bdf8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor:
                            isSending || !userInput.trim() ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '13px',
                          transition: 'all 0.2s',
                          opacity: isSending || !userInput.trim() ? 0.6 : 1
                        }}
                        onMouseOver={(e) => {
                          if (!isSending && userInput.trim()) e.target.style.backgroundColor = '#0ea5e9'
                        }}
                        onMouseOut={(e) => {
                          if (!isSending && userInput.trim()) {
                            e.target.style.backgroundColor = '#38bdf8'
                          } else {
                            e.target.style.backgroundColor = '#475569'
                          }
                        }}
                      >
                        {isSending ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // PDF VIEW
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ fontSize: '64px' }}>📄</div>
                  <div style={{ textAlign: 'center' }}>
                    <p
                      style={{
                        margin: '0 0 4px 0',
                        fontSize: '16px',
                        color: '#f1f5f9',
                        fontWeight: 600
                      }}
                    >
                      PDF Viewer
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      Document will load from Firebase
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: COLLAPSIBLE OUTPUT */}
        {isOutputOpen && (
          <div
            style={{
              height: '250px',
              display: 'flex',
              flexDirection: 'column',
              borderTop: '2px solid #334155',
              backgroundColor: '#020617'
            }}
          >
            <div
              style={{
                height: '50px',
                backgroundColor: '#1e293b',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                fontSize: '14px',
                fontWeight: 600,
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🖥️</span>
                <span>Output</span>
              </div>
              <button
                onClick={toggleOutput}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#334155'
                  e.target.style.color = '#f8fafc'
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'transparent'
                  e.target.style.color = '#94a3b8'
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
              {output ? (
                <pre
                  style={{
                    margin: 0,
                    color: '#94a3b8',
                    fontFamily: '"Courier New", monospace',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {output}
                </pre>
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    fontSize: '14px'
                  }}
                >
                  Click "Run" to see output
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditorPage
