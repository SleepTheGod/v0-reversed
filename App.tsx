import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { 
  Send, 
  Paperclip, 
  Bot, 
  User, 
  Code2, 
  Terminal, 
  Settings, 
  History, 
  PlusCircle,
  X,
  Loader2,
  Sparkles,
  Check,
  Copy,
  Trash2,
  AlertCircle,
  Menu,
  Play,
  Download,
  Maximize2,
  RefreshCw,
  FileCode,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { streamGeminiResponse } from './services/geminiService';
import { Message, ChatSession, FileAttachment } from './types';

// --- Utilities ---

const createNewSession = (): ChatSession => ({
  id: Date.now().toString(),
  title: 'New Project',
  messages: [
    {
      id: 'welcome',
      role: 'model',
      text: "I'm ready. I can build web apps, debug code, and analyze images. \n\nAsk me to create a login form, a dashboard, or a game, and I'll generate a live preview for you.",
      timestamp: Date.now()
    }
  ],
  createdAt: Date.now(),
  lastModified: Date.now()
});

const groupSessionsByDate = (sessions: ChatSession[]): Record<string, ChatSession[]> => {
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = new Date(today - 86400000).setHours(0, 0, 0, 0);
  
  const groups: Record<string, ChatSession[]> = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 Days': [],
    'Older': []
  };

  sessions.forEach(session => {
    const date = new Date(session.lastModified).setHours(0, 0, 0, 0);
    if (date === today) groups['Today'].push(session);
    else if (date === yesterday) groups['Yesterday'].push(session);
    else if (date > today - 86400000 * 7) groups['Previous 7 Days'].push(session);
    else groups['Older'].push(session);
  });

  return groups;
};

// --- Main Component ---

const App: React.FC = () => {
  // --- State ---
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_v0_sessions');
      return saved ? JSON.parse(saved) : [createNewSession()];
    } catch {
      return [createNewSession()];
    }
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
     return sessions[0]?.id || '';
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // Toggle between Chat and Preview
  const [activePreviewCode, setActivePreviewCode] = useState<string>(''); // Code to render in iframe
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId) || sessions[0], 
    [sessions, currentSessionId]
  );

  // --- Effects ---

  useEffect(() => {
    localStorage.setItem('gemini_v0_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (!showPreview) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession.messages, isLoading, showPreview]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Extract previewable code from the last model message
  useEffect(() => {
    const lastMsg = currentSession.messages[currentSession.messages.length - 1];
    if (lastMsg?.role === 'model' && lastMsg.isPreviewable) {
      const htmlMatch = lastMsg.text.match(/```html([\s\S]*?)```/);
      const cssMatch = lastMsg.text.match(/```css([\s\S]*?)```/);
      const jsMatch = lastMsg.text.match(/```(?:javascript|js)([\s\S]*?)```/);

      let fullHtml = '';
      
      if (htmlMatch) {
        fullHtml = htmlMatch[1];
        // Inject CSS if present and not already in HTML
        if (cssMatch && !fullHtml.includes('<style>')) {
          fullHtml = fullHtml.replace('</head>', `<style>${cssMatch[1]}</style></head>`);
        }
        // Inject JS if present and not already in HTML
        if (jsMatch && !fullHtml.includes('<script>')) {
          fullHtml = fullHtml.replace('</body>', `<script>${jsMatch[1]}</script></body>`);
        }
        setActivePreviewCode(fullHtml);
        if (!isLoading) setShowPreview(true); // Auto-show preview when done
      }
    }
  }, [currentSession.messages, isLoading]);

  // --- Handlers ---

  const handleCreateSession = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setShowSidebar(false);
    setShowPreview(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    if (newSessions.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setCurrentSessionId(fresh.id);
    } else {
      setSessions(newSessions);
      if (currentSessionId === id) {
        setCurrentSessionId(newSessions[0].id);
      }
    }
  };

  const processFile = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isText = file.type.startsWith('text/') || 
                   file.name.endsWith('.js') || 
                   file.name.endsWith('.ts') || 
                   file.name.endsWith('.tsx') || 
                   file.name.endsWith('.json') ||
                   file.name.endsWith('.css') ||
                   file.name.endsWith('.html') ||
                   file.name.endsWith('.md');

    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result as string;
      
      if (isImage) {
        // For images we want base64 for the API
        const base64Data = result.split(',')[1];
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64Data,
          preview: result,
          isText: false
        }]);
      } else if (isText) {
        // For text we keep the raw content
        setAttachments(prev => [...prev, {
          name: file.name,
          type: 'text/plain', // Generic text type for API context
          data: btoa(result), // Base64 encode text for consistency in storage/types, but we use textContent for logic
          preview: '', 
          isText: true,
          textContent: result
        }]);
      }
    };

    if (isImage) reader.readAsDataURL(file);
    else if (isText) reader.readAsText(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(processFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag and Drop
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.style.borderColor = '#6366f1';
  };
  
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.style.borderColor = '';
  };
  
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.style.borderColor = '';
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  };

  const updateCurrentSession = (updater: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === currentSessionId ? updater(s) : s));
  };

  const handleSubmit = async (e?: React.FormEvent, retryPrompt?: string) => {
    e?.preventDefault();
    const textToSend = retryPrompt || input;
    
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    if (!retryPrompt) {
        setInput('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    const newMessageId = Date.now().toString();
    const userMessage: Message = {
      id: newMessageId,
      role: 'user',
      text: textToSend,
      attachments: retryPrompt ? [] : [...attachments], // Don't re-attach on retry unless we handled that logic differently
      timestamp: Date.now()
    };

    // If it's a retry, we typically don't add the user message again, but for simplicity here we assume standard send
    // For a true "Retry", we usually just re-trigger the last generation. 
    // Let's stick to standard flow: User adds message -> Model responds.
    
    updateCurrentSession(session => ({
      ...session,
      messages: [...session.messages, userMessage],
      lastModified: Date.now(),
      title: session.title === 'New Project' ? (textToSend.substring(0, 30) || 'Image Analysis') : session.title
    }));

    setIsLoading(true);
    setShowPreview(false); // Switch back to chat on new message

    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = {
      id: modelMessageId,
      role: 'model',
      text: '',
      timestamp: Date.now() + 1
    };

    updateCurrentSession(session => ({
      ...session,
      messages: [...session.messages, initialModelMessage]
    }));

    try {
      await streamGeminiResponse(
        textToSend, 
        retryPrompt ? [] : attachments,
        (chunk) => {
          updateCurrentSession(session => ({
            ...session,
            messages: session.messages.map(msg => 
              msg.id === modelMessageId 
                ? { 
                    ...msg, 
                    text: msg.text + chunk,
                    isPreviewable: (msg.text + chunk).includes('```html') 
                  }
                : msg
            )
          }));
        }
      );
    } catch (error) {
      console.error(error);
      updateCurrentSession(session => ({
        ...session,
        messages: session.messages.map(msg => 
          msg.id === modelMessageId 
                ? { ...msg, error: true, text: msg.text + "\n\n*Error generating response. Please try again.*" }
            : msg
        )
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (code: string) => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Renderers ---

  const CodeBlock = ({ inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const [copied, setCopied] = useState(false);
    const codeString = String(children).replace(/\n$/, '');

    const handleCopy = () => {
      navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (!inline && match) {
      return (
        <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-[#1e1e1e] shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#3e3e3e]">
            <div className="flex items-center gap-2">
              <Code2 size={14} className="text-blue-400" />
              <span className="text-xs font-mono text-gray-300 uppercase">{match[1]}</span>
            </div>
            <div className="flex items-center gap-2">
               {/* Quick Preview Button for HTML blocks */}
               {match[1] === 'html' && (
                 <button
                    onClick={() => {
                        setActivePreviewCode(codeString);
                        setShowPreview(true);
                    }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors mr-2"
                 >
                    <Play size={14} className="text-green-400" />
                    <span>Run</span>
                 </button>
               )}
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '1.5rem',
                fontSize: '0.875rem',
                lineHeight: '1.5',
                background: 'transparent'
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        </div>
      );
    }

    return (
      <code className={`${inline ? 'bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-pink-600' : ''} ${className}`} {...props}>
        {children}
      </code>
    );
  };

  const sessionGroups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  return (
    <div 
      className="flex h-screen bg-background text-foreground overflow-hidden font-sans"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      
      {/* Mobile Overlay */}
      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-40 h-full w-[280px] flex flex-col
        bg-muted/30 border-r border-border backdrop-blur-xl md:translate-x-0 transition-transform duration-300
        ${showSidebar ? 'translate-x-0 bg-background' : '-translate-x-full'}
      `}>
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Terminal size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight">Gemini Code Pro</h1>
            <p className="text-[10px] text-muted-foreground font-medium">v0 Clone • Free Tier</p>
          </div>
        </div>
        
        <div className="p-3">
          <button 
            onClick={handleCreateSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-all shadow-sm group"
          >
            <PlusCircle size={16} className="group-hover:rotate-90 transition-transform" />
            <span>New Project</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {Object.entries(sessionGroups).map(([group, data]) => {
            const groupSessions = data as ChatSession[];
            if (groupSessions.length === 0) return null;
            return (
              <div key={group}>
                <div className="text-[10px] font-bold text-muted-foreground/70 px-2 mb-2 uppercase tracking-wider">{group}</div>
                <div className="space-y-1">
                  {groupSessions.map(session => (
                    <div 
                      key={session.id}
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        setShowSidebar(false);
                      }}
                      className={`
                        group relative flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-all border border-transparent
                        ${currentSessionId === session.id 
                          ? 'bg-background shadow-sm border-border text-foreground font-medium' 
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }
                      `}
                    >
                      <History size={14} className={currentSessionId === session.id ? 'text-indigo-500' : 'opacity-50'} />
                      <span className="truncate flex-1">{session.title}</span>
                      <button 
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className={`
                          p-1 rounded-md hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100
                          ${sessions.length === 1 ? 'hidden' : ''}
                        `}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/50 bg-background/50">
           {/* Drop Zone Indicator (Only visible when dragging) */}
           <div ref={dropZoneRef} className="absolute inset-0 border-2 border-dashed border-transparent pointer-events-none transition-colors m-2 rounded-xl" />
           <div className="flex items-center gap-2 text-xs text-muted-foreground">
             <div className="w-2 h-2 rounded-full bg-green-500"></div>
             <span>System Online</span>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
             <button onClick={() => setShowSidebar(true)} className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <Menu size={20} />
            </button>
            
            {/* View Toggles */}
            <div className="flex bg-muted/50 p-1 rounded-lg">
              <button 
                onClick={() => setShowPreview(false)}
                className={`
                   flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-all
                   ${!showPreview ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}
                `}
              >
                <Code2 size={14} />
                Code
              </button>
              <button 
                onClick={() => activePreviewCode && setShowPreview(true)}
                disabled={!activePreviewCode}
                className={`
                   flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-all
                   ${showPreview ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}
                   ${!activePreviewCode ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <Eye size={14} />
                Preview
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showPreview && (
               <button 
                onClick={() => handleDownload(activePreviewCode)}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center gap-2"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            <button className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          {/* Chat View */}
          <div className={`
             flex-1 flex flex-col min-w-0 transition-transform duration-300 bg-background
             ${showPreview ? '-translate-x-full absolute inset-0' : 'translate-x-0'}
          `}>
             {/* Chat Scroll Area */}
            <div className="flex-1 overflow-y-auto scroll-smooth">
              <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 pb-4">
                {currentSession.messages.map((msg, idx) => (
                  <div 
                    key={msg.id} 
                    className={`group flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm
                      ${msg.role === 'model' 
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' 
                        : 'bg-muted text-muted-foreground'
                      }
                    `}>
                      {msg.role === 'model' ? <Sparkles size={16} /> : <User size={16} />}
                    </div>

                    {/* Message Content */}
                    <div className={`flex flex-col max-w-[90%] md:max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      
                      {/* Attachments Display */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-1 justify-end">
                          {msg.attachments.map((file, i) => (
                            <div key={i} className="relative overflow-hidden rounded-lg border border-border w-40 h-28 bg-muted shadow-sm hover:shadow-md transition-shadow">
                              {file.type.startsWith('image/') ? (
                                <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-zinc-100 dark:bg-zinc-800">
                                  <FileCode size={20} className="mb-2 text-indigo-500" />
                                  <span className="text-xs font-mono text-muted-foreground truncate w-full px-2">{file.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Text Bubble */}
                      <div className={`
                        rounded-2xl px-5 py-4 shadow-sm text-sm md:text-base leading-relaxed overflow-hidden relative
                        ${msg.role === 'user' 
                          ? 'bg-foreground text-background rounded-tr-sm' 
                          : 'bg-white border border-border/60 rounded-tl-sm'
                        }
                        ${msg.error ? 'border-red-200 bg-red-50' : ''}
                      `}>
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          <div className="markdown-body w-full">
                            <ReactMarkdown
                                components={{
                                  code: CodeBlock
                                }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                            
                            {/* Loading/Streaming Indicator */}
                            {msg.text.length === 0 && isLoading && idx === currentSession.messages.length - 1 && (
                              <div className="flex items-center gap-2 h-6 text-muted-foreground">
                                <span className="text-xs font-medium animate-pulse">Thinking</span>
                                <div className="flex gap-0.5">
                                  <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                  <div className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                  <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {msg.error && (
                          <div className="flex flex-col gap-2 mt-2">
                             <div className="flex items-center gap-2 text-red-600 text-xs font-medium">
                                <AlertCircle size={14} />
                                <span>Generation Error</span>
                             </div>
                             <button 
                               onClick={() => handleSubmit(undefined, currentSession.messages[currentSession.messages.length - 2]?.text)}
                               className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded self-start hover:bg-red-200 transition-colors"
                             >
                               Retry
                             </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Timestamp & Actions */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                        <span className="text-[10px] text-muted-foreground">
                           {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.role === 'model' && !msg.error && (
                           <button 
                             onClick={() => {
                                navigator.clipboard.writeText(msg.text);
                             }}
                             className="text-muted-foreground hover:text-foreground"
                           >
                             <Copy size={12} />
                           </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-background/80 backdrop-blur-sm border-t border-border z-20">
              <div className="max-w-4xl mx-auto">
                {/* Attachment Preview Bar */}
                {attachments.length > 0 && (
                  <div className="flex gap-3 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="relative group shrink-0 w-16 h-16 rounded-lg border border-border overflow-hidden shadow-sm">
                        {file.type.startsWith('image/') ? (
                          <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-muted flex flex-col items-center justify-center p-1">
                              <FileCode size={18} className="text-muted-foreground mb-1" />
                              <span className="text-[8px] text-muted-foreground w-full truncate text-center">{file.name}</span>
                            </div>
                        )}
                        <button 
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <X size={16} className="text-white drop-shadow-md" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`
                  relative rounded-2xl border bg-background shadow-lg transition-all duration-200
                  ${isLoading ? 'border-border opacity-80' : 'border-border hover:border-indigo-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10'}
                `}>
                  <div className="flex flex-col gap-2 p-3">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="Ask Gemini to code, debug, or explain..."
                      className="w-full bg-transparent resize-none border-none focus:ring-0 p-0 text-base max-h-[300px] min-h-[44px] placeholder:text-muted-foreground/70"
                      rows={1}
                    />
                    
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2">
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          className="hidden" 
                          onChange={handleFileSelect}
                          multiple
                        />
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                          title="Attach files"
                        >
                          <Paperclip size={18} />
                          <span className="hidden sm:inline">Attach</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground hidden sm:inline-block mr-2">
                          Shift+Enter for new line
                        </span>
                        <button 
                          onClick={() => handleSubmit()}
                          disabled={(!input.trim() && attachments.length === 0) || isLoading}
                          className={`
                            p-2.5 rounded-xl transition-all duration-200 flex items-center gap-2
                            ${(!input.trim() && attachments.length === 0) || isLoading
                              ? 'bg-muted text-muted-foreground cursor-not-allowed'
                              : 'bg-foreground text-background hover:bg-indigo-600 hover:text-white shadow-md hover:shadow-lg'
                            }
                          `}
                        >
                          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                          <span className="sr-only">Send</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <p className="text-[10px] text-muted-foreground/60">
                    Gemini 2.5 Flash can make mistakes. Verify critical code.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview View */}
          <div className={`
            absolute inset-0 bg-gray-100 flex flex-col transition-transform duration-300
            ${showPreview ? 'translate-x-0' : 'translate-x-full'}
          `}>
             <div className="flex items-center justify-between p-2 bg-white border-b border-border">
               <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Eye size={16} />
                  Live Preview
               </div>
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                        const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                        if(iframe) iframe.srcdoc = activePreviewCode;
                    }}
                    className="p-2 hover:bg-gray-100 rounded text-gray-600"
                    title="Refresh Preview"
                  >
                    <RefreshCw size={16} />
                  </button>
               </div>
             </div>
             <div className="flex-1 w-full h-full relative">
                {activePreviewCode ? (
                    <iframe 
                      id="preview-iframe"
                      title="preview"
                      srcDoc={activePreviewCode}
                      className="w-full h-full border-none bg-white"
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <Code2 size={48} className="mb-4 opacity-20" />
                        <p>No code generated to preview yet.</p>
                        <button 
                          onClick={() => setShowPreview(false)} 
                          className="mt-4 text-indigo-600 hover:underline text-sm"
                        >
                          Go back to chat
                        </button>
                    </div>
                )}
             </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;