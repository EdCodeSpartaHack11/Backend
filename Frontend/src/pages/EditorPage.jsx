import React, { useState } from 'react'
import Editor from '@monaco-editor/react'

const EditorPage = () => {
    const [code, setCode] = useState('// Write your code here\nfunction reverseString(str) {\n  // Your solution\n}\n')
    const [output, setOutput] = useState('')
    const [isOutputOpen, setIsOutputOpen] = useState(false)
    const [rightPanelView, setRightPanelView] = useState('assistant')
    const [language, setLanguage] = useState('javascript')

    const handleRun = () => {
        setOutput('> Running code...\n\n' + code + '\n\n✓ Code executed successfully!')
        setIsOutputOpen(true)
    }

    const toggleOutput = () => {
        setIsOutputOpen(!isOutputOpen)
    }

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                height: '60px',
                backgroundColor: '#1e293b',
                borderBottom: '2px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Code Editor</h1>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => window.location.href = '/dashboard'}
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
                        onMouseOver={(e) => e.target.style.backgroundColor = '#475569'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#334155'}
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
                        onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
                    >
                        ✓ Mark as Completed
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Top Section: Code + Assistant/PDF */}
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: '13fr 7fr',
                    gap: '0',
                    overflow: 'hidden'
                }}>
                    {/* Panel 1: CODE */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderRight: '2px solid #334155',
                        backgroundColor: '#0f172a'
                    }}>
                        <div style={{
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
                        }}>
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
                                    onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                                    onBlur={(e) => e.target.style.borderColor = '#334155'}
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
                                    onMouseOver={(e) => e.target.style.backgroundColor = '#0ea5e9'}
                                    onMouseOut={(e) => e.target.style.backgroundColor = '#38bdf8'}
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
                                    onMouseOver={(e) => e.target.style.opacity = '0.8'}
                                    onMouseOut={(e) => e.target.style.opacity = '1'}
                                >
                                    {isOutputOpen ? '▼ Hide' : '▲ Output'}
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1 }}>
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
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: '#0f172a'
                    }}>
                        {/* Tab Switcher */}
                        <div style={{
                            height: '50px',
                            backgroundColor: '#1e293b',
                            borderBottom: '1px solid #334155',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0'
                        }}>
                            <button
                                onClick={() => setRightPanelView('assistant')}
                                style={{
                                    flex: 1,
                                    height: '100%',
                                    backgroundColor: rightPanelView === 'assistant' ? '#0f172a' : 'transparent',
                                    color: rightPanelView === 'assistant' ? '#f8fafc' : '#94a3b8',
                                    border: 'none',
                                    borderBottom: rightPanelView === 'assistant' ? '2px solid #38bdf8' : '2px solid transparent',
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
                                    borderBottom: rightPanelView === 'pdf' ? '2px solid #38bdf8' : '2px solid transparent',
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
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            {rightPanelView === 'assistant' ? (
                                // ASSISTANT VIEW - Chat Only
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    backgroundColor: '#0f172a'
                                }}>
                                    {/* Chat History (Scrollable) */}
                                    <div style={{
                                        flex: 1,
                                        padding: '20px',
                                        overflow: 'auto',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px'
                                    }}>
                                        {/* Placeholder for future chat messages */}
                                        <div style={{
                                            flex: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#64748b',
                                            fontSize: '14px',
                                            textAlign: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>💬</div>
                                                <p style={{ margin: 0 }}>Start a conversation with the assistant</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chat Input (Fixed at bottom) */}
                                    <div style={{
                                        padding: '16px 20px',
                                        backgroundColor: '#1e293b',
                                        borderTop: '1px solid #334155'
                                    }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                placeholder="Ask me anything..."
                                                style={{
                                                    flex: 1,
                                                    padding: '10px 12px',
                                                    backgroundColor: '#0f172a',
                                                    border: '1px solid #334155',
                                                    borderRadius: '6px',
                                                    color: '#f8fafc',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                                                onBlur={(e) => e.target.style.borderColor = '#334155'}
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        // TODO: Send message
                                                        console.log('Message sent:', e.target.value)
                                                    }
                                                }}
                                            />
                                            <button
                                                style={{
                                                    padding: '10px 20px',
                                                    backgroundColor: '#38bdf8',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => e.target.style.backgroundColor = '#0ea5e9'}
                                                onMouseOut={(e) => e.target.style.backgroundColor = '#38bdf8'}
                                                onClick={() => {
                                                    // TODO: Send message
                                                    console.log('Send button clicked')
                                                }}
                                            >
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // PDF VIEW
                                <div style={{
                                    height: '100%',
                                    backgroundColor: '#1e293b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    <div style={{ fontSize: '64px' }}>📄</div>
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#f1f5f9', fontWeight: 600 }}>
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
                    <div style={{
                        height: '250px',
                        display: 'flex',
                        flexDirection: 'column',
                        borderTop: '2px solid #334155',
                        backgroundColor: '#020617'
                    }}>
                        <div style={{
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
                        }}>
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
                                <pre style={{
                                    margin: 0,
                                    color: '#94a3b8',
                                    fontFamily: '"Courier New", monospace',
                                    fontSize: '13px',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {output}
                                </pre>
                            ) : (
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#64748b',
                                    fontSize: '14px'
                                }}>
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
