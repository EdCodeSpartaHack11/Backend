import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'

const EditorPage = () => {
  const [code, setCode] = useState(
    '// Write your code here\nfunction reverseString(str) {\n  // Your solution\n}\n'
  )
  const [output, setOutput] = useState('')
  const [isOutputOpen, setIsOutputOpen] = useState(false)
  const [rightPanelView, setRightPanelView] = useState('pdf') // Start with PDF view since you have them
  const [language, setLanguage] = useState('javascript')
  const [canSubmit, setCanSubmit] = useState(false)
  const [pdfExists, setPdfExists] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const [searchParams] = useSearchParams()
  const partId = searchParams.get('partId')

  // Chat state
  const [messages, setMessages] = useState([])
  const [userInput, setUserInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState(null)
  const chatContainerRef = useRef(null)

  // Check if PDF exists when component mounts or partId changes
  useEffect(() => {
    if (partId) {
      checkPdfExists(partId)
    } else {
      setPdfExists(false)
    }
  }, [partId])

  const checkPdfExists = async (id) => {
    setPdfLoading(true)
    try {
      // First try a HEAD request to check if PDF exists
      const response = await fetch(`/pdfs/${id}.pdf`, { method: 'HEAD' })
      if (response.ok) {
        setPdfExists(true)
      } else {
        // If HEAD fails, try GET with small range to minimize download
        const getResponse = await fetch(`/pdfs/${id}.pdf`, { 
          headers: { 'Range': 'bytes=0-1023' } // Just first 1KB
        })
        setPdfExists(getResponse.ok || getResponse.status === 206) // 206 = Partial Content
      }
    } catch (error) {
      console.log(`PDF not found for part ${id}:`, error)
      setPdfExists(false)
    } finally {
      setPdfLoading(false)
    }
  }

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

      if (data.status === "accepted") {
        setCanSubmit(true)
      } else {
        setCanSubmit(false)
      }

      let formattedOutput = ""
      if (data.tests && Array.isArray(data.tests)) {
        formattedOutput = data.tests.map((t, index) => {
          const status = t.passed ? "Passed" : "Failed"
          let details = ""
          if (!t.passed) {
            const exp = t.expected !== undefined ? t.expected : "?"

            const got = t.stdout !== undefined ? t.stdout.trim() : "?"
            details = `\n   Expected: ${JSON.stringify(exp)}\n   Got: ${JSON.stringify(got)}`
            if (t.stderr) details += `\n   Error: ${t.stderr}`
          }
          return `> TestCase ${index + 1} : ${status}${details}`
        }).join("\n\n")

        formattedOutput += `\n\n> Final Status: ${data.status}`
      } else {
        formattedOutput = `> Response:\n${JSON.stringify(data, null, 2)}`
      }

      setOutput(formattedOutput)

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

    try {
      const response = await fetch('http://localhost:8000/ai/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        let errorData
        const contentType = response.headers.get('content-type')

        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json()
        } else {
          const textError = await response.text()
          errorData = { detail: textError }
        }

        let errorMsg = `HTTP ${response.status}: `
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg += errorData.detail
          } else if (Array.isArray(errorData.detail)) {
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

      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error('Chat error:', err)
      const errorMessage = err.message || 'Failed to send message'
      setError(errorMessage)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f1f5f9',
        color: '#1e293b',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '70px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          boxShadow: '0 2px 4px -1px rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 32, height: 32, background: '#0f172a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900 }}>E</div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Code Editor</h1>
          {partId && (
            <div style={{ 
              padding: '4px 12px', 
              backgroundColor: '#e0f2fe', 
              color: '#0369a1', 
              borderRadius: '6px', 
              fontSize: '12px', 
              fontWeight: '600',
              border: '1px solid #bae6fd'
            }}>
              Part: {partId}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#475569',
              border: '2px solid #cbd5e1',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '14px',
              boxShadow: '0 4px 0 #cbd5e1',
              transition: 'all 0.1s ease',
              transform: 'translateY(0)'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(2px)'
              e.currentTarget.style.boxShadow = '0 2px 0 #cbd5e1'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 0 #cbd5e1'
            }}
          >
            ← Dashboard
          </button>
          <button
            onClick={async () => {
              if (canSubmit) {
                let userEmail = "guest@example.com"
                try {
                  const storedUser = localStorage.getItem("user")
                  if (storedUser) {
                    const u = JSON.parse(storedUser)
                    if (u.email) userEmail = u.email
                  }
                } catch (e) {
                  console.error("Error parsing user for completion:", e)
                }

                try {
                  const res = await fetch('http://localhost:8000/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      project_id: partId || "default_project",
                      email: userEmail
                    })
                  })
                  if (res.ok) {
                    alert('Problem marked as completed! Contribution logged.')
                  } else {
                    alert('Failed to log completion. See console.')
                    console.error(await res.text())
                  }
                } catch (e) {
                  console.error("Completion error:", e)
                  alert('Error marking completion.')
                }
              }
            }}
            disabled={!canSubmit}
            style={{
              padding: '10px 24px',
              backgroundColor: canSubmit ? '#ecfdf5' : '#f1f5f9',
              color: canSubmit ? '#065f46' : '#94a3b8',
              border: canSubmit ? '2px solid #059669' : '2px solid #cbd5e1',
              borderRadius: '12px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: '700',
              fontSize: '14px',
              boxShadow: canSubmit ? '0 4px 0 #059669' : 'none',
              transition: 'all 0.1s ease',
              opacity: canSubmit ? 1 : 0.8,
              transform: 'translateY(0)'
            }}
            onMouseDown={(e) => {
              if (canSubmit) {
                e.currentTarget.style.transform = 'translateY(2px)'
                e.currentTarget.style.boxShadow = '0 2px 0 #059669'
              }
            }}
            onMouseUp={(e) => {
              if (canSubmit) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 0 #059669'
              }
            }}
          >
            ✓ Mark Completed
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
            minHeight: 0,
            minWidth: 0
          }}
        >
          {/* Panel 1: CODE */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'white',
              border: '2px solid #cbd5e1',
              borderRadius: '16px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
              minWidth: 0,
              minHeight: 0
            }}
          >
            <div
              style={{
                height: '60px',
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                fontSize: '14px',
                fontWeight: 600,
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>💻</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    color: '#0f172a',
                    border: '2px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 2px 0 #cbd5e1'
                  }}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleRun}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: '#f0fdf4',
                    color: '#15803d',
                    border: '2px solid #22c55e',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '13px',
                    boxShadow: '0 4px 0 #22c55e',
                    transition: 'all 0.1s ease'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(2px)'
                    e.currentTarget.style.boxShadow = '0 2px 0 #22c55e'
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 0 #22c55e'
                  }}
                >
                  ▶ Run Code
                </button>
                <button
                  onClick={toggleOutput}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isOutputOpen ? '#eff6ff' : 'white',
                    color: '#1e40af',
                    border: '2px solid #93c5fd',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '13px',
                    boxShadow: '0 4px 0 #93c5fd',
                    transition: 'all 0.1s ease'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(2px)'
                    e.currentTarget.style.boxShadow = '0 2px 0 #93c5fd'
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 0 #93c5fd'
                  }}
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
                theme="light"
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
              backgroundColor: 'white',
              border: '2px solid #cbd5e1',
              borderRadius: '16px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden',
              minWidth: 0,
              minHeight: 0
            }}
          >
            {/* Tab Switcher */}
            <div
              style={{
                height: '60px',
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0',
                padding: '0 8px'
              }}
            >
              <button
                onClick={() => setRightPanelView('pdf')}
                style={{
                  flex: 1,
                  height: '42px',
                  backgroundColor: rightPanelView === 'pdf' ? 'white' : 'transparent',
                  color: rightPanelView === 'pdf' ? '#0f172a' : '#64748b',
                  border: rightPanelView === 'pdf' ? '2px solid #cbd5e1' : 'none',
                  borderBottom: rightPanelView === 'pdf' ? 'none' : '2px solid transparent',
                  borderRadius: rightPanelView === 'pdf' ? '12px 12px 0 0' : '0',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span>📄</span>
                <span>Problem</span>
                {pdfExists && (
                  <div style={{ 
                    width: '6px', 
                    height: '6px', 
                    backgroundColor: '#22c55e', 
                    borderRadius: '50%',
                    marginLeft: '4px'
                  }} />
                )}
              </button>
              <button
                onClick={() => setRightPanelView('assistant')}
                style={{
                  flex: 1,
                  height: '42px',
                  backgroundColor: rightPanelView === 'assistant' ? 'white' : 'transparent',
                  color: rightPanelView === 'assistant' ? '#0f172a' : '#64748b',
                  border: rightPanelView === 'assistant' ? '2px solid #cbd5e1' : 'none',
                  borderBottom: rightPanelView === 'assistant' ? 'none' : '2px solid transparent',
                  borderRadius: rightPanelView === 'assistant' ? '12px 12px 0 0' : '0',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span>💬</span>
                <span>Assistant</span>
              </button>
            </div>

            {/* Content Area */}
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0,
                minWidth: 0,
                backgroundColor: 'white'
              }}
            >
              {rightPanelView === 'pdf' ? (
                // PDF VIEW
                <div
                  style={{
                    height: '100%',
                    backgroundColor: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                >
                  {pdfLoading ? (
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '12px',
                        backgroundColor: '#f8fafc'
                      }}
                    >
                      <div style={{ fontSize: '24px', opacity: 0.5 }}>📄</div>
                      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading PDF...</div>
                    </div>
                  ) : pdfExists ? (
                    <iframe
                      src={`/pdfs/${partId}.pdf`}
                      title={`Problem PDF for ${partId}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        borderRadius: '0 0 16px 16px'
                      }}
                      onError={() => {
                        console.error(`Failed to load PDF: ${partId}.pdf`)
                        setPdfExists(false)
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      <div style={{ fontSize: '64px', opacity: 0.3 }}>📄</div>
                      <div style={{ textAlign: 'center' }}>
                        <p
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: '16px',
                            color: '#334155',
                            fontWeight: 700
                          }}
                        >
                          No Problem PDF Available
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                          {partId ? `Looking for ${partId}.pdf in /pdfs/` : 'No part ID specified'}
                        </p>
                        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                          Available PDFs: 6YP0ATNJpZwaClb857at, 9dE7nKOoISGRy3oMiM7N, F1j83oMYAFHlayNFw1r6, and more...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // ASSISTANT VIEW - Chat Only
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'white',
                    minHeight: 0,
                    minWidth: 0
                  }}
                >
                  {/* Chat History (Scrollable) */}
                  <div
                    ref={chatContainerRef}
                    style={{
                      flex: 1,
                      minHeight: 0,
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
                          color: '#94a3b8',
                          fontSize: '14px',
                          textAlign: 'center',
                          padding: '40px 0'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>💬</div>
                          <p style={{ margin: 0, fontWeight: 500 }}>Start a conversation with the assistant</p>
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
                              padding: '12px 16px',
                              borderRadius: '16px',
                              borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                              borderTopLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                              backgroundColor: msg.role === 'user' ? '#e0f2fe' : '#f1f5f9',
                              color: '#0f172a',
                              border: msg.role === 'user' ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                              fontSize: '14px',
                              lineHeight: '1.5',
                              wordWrap: 'break-word',
                              whiteSpace: 'pre-wrap',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              {msg.role === 'user' ? 'YOU' : 'ASSISTANT'}
                            </span>
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
                            backgroundColor: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '13px',
                            fontStyle: 'italic'
                          }}
                        >
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input (Fixed at bottom) */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'white',
                      borderTop: '2px solid #f1f5f9'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Ask me anything..."
                        disabled={isSending}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          backgroundColor: '#f8fafc',
                          border: '2px solid #e2e8f0',
                          borderRadius: '10px',
                          color: '#0f172a',
                          fontSize: '14px',
                          outline: 'none',
                          opacity: isSending ? 0.6 : 1,
                          transition: 'all 0.2s'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#38bdf8'
                          e.target.style.backgroundColor = 'white'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.backgroundColor = '#f8fafc'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSending) sendMessage()
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={isSending || !userInput.trim()}
                        style={{
                          padding: '10px 24px',
                          backgroundColor: isSending || !userInput.trim() ? '#e2e8f0' : '#38bdf8',
                          color: isSending || !userInput.trim() ? '#94a3b8' : 'white',
                          border: 'none',
                          borderRadius: '10px',
                          cursor: isSending || !userInput.trim() ? 'not-allowed' : 'pointer',
                          fontWeight: '700',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                          boxShadow: isSending || !userInput.trim() ? 'none' : '0 4px 0 #0284c7'
                        }}
                        onMouseDown={(e) => {
                          if (!isSending && userInput.trim()) {
                            e.currentTarget.style.transform = 'translateY(2px)'
                            e.currentTarget.style.boxShadow = '0 2px 0 #0284c7'
                          }
                        }}
                        onMouseUp={(e) => {
                          if (!isSending && userInput.trim()) {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 4px 0 #0284c7'
                          }
                        }}
                      >
                        {isSending ? '...' : 'Send'}
                      </button>
                    </div>
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
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              border: '2px solid #334155',
              overflow: 'hidden',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div
              style={{
                height: '40px',
                backgroundColor: '#334155',
                borderBottom: '1px solid #475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🖥️</span>
                <span>Console Output</span>
              </div>
              <button
                onClick={toggleOutput}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
              {output ? (
                <pre
                  style={{
                    margin: 0,
                    color: '#e2e8f0',
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
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
                  <span style={{ opacity: 0.5 }}>No output generated yet. Click Run to execute.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div >
  )
}

export default EditorPage
