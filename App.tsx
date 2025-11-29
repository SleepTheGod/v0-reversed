import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  Menu
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { streamGeminiResponse } from './services/geminiService';
import { Message, ChatSession, FileAttachment } from './types';

// Utility for creating a new session
const createNewSession = (): ChatSession => ({
  id: Date.now().toString(),
  title: 'New Chat',
  messages: [
    {
      id: 'welcome',
      role: 'model',
      text: "Hello! I'm your advanced AI coding assistant. I can write code in any language, debug complex issues, and help you build applications. \n\nI'm ready to code. What shall we build today?",
      timestamp: Date.now()
    }
  ],
  createdAt: Date.now()
});

const App: React.FC = () => {
  // --- State Management ---
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_sessions');
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
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  // --- Effects ---

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('gemini_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession.messages, isLoading]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // --- Handlers ---

  const handleCreateSession = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setShowSidebar(false); // On mobile
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const base64String = event.target?.result as string;
        const base64Data = base64String.split(',')[1];
        
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64Data,
          preview: base64String
        }]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const updateCurrentSessionMessages = (updater: (msgs: Message[]) => Message[]) => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return { ...session, messages: updater(session.messages) };
      }
      return session;
    }));
  };

  const updateSessionTitle = (id: string, firstMessage: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === id && session.title === 'New Chat') {
        return { 
          ...session, 
          title: firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage 
        };
      }
      return session;
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const currentInput = input;
    const currentAttachments = [...attachments];

    // Reset input state immediately
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentInput,
      attachments: currentAttachments,
      timestamp: Date.now()
    };

    updateCurrentSessionMessages(prev => [...prev, userMessage]);
    updateSessionTitle(currentSessionId, currentInput);
    setIsLoading(true);

    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = {
      id: modelMessageId,
      role: 'model',
      text: '',
      timestamp: Date.now() + 1
    };

    updateCurrentSessionMessages(prev => [...prev, initialModelMessage]);

    try {
      await streamGeminiResponse(
        currentInput, 
        currentAttachments,
        (chunk) => {
          updateCurrentSessionMessages(prev => prev.map(msg => 
            msg.id === modelMessageId 
              ? { ...msg, text: msg.text + chunk }
              : msg
          ));
        }
      );
    } catch (error) {
      console.error('Error generating response:', error);
      updateCurrentSessionMessages(prev => prev.map(msg => 
        msg.id === modelMessageId 
          ? { ...msg, error: true, text: msg.text + "\n\n*Connection interrupted. Please try again.*" }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Components ---

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
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      
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
            <p className="text-[10px] text-muted-foreground font-medium">Free Tier • v2.5 Flash</p>
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
        
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">Recent Chats</div>
          {sessions.map(session => (
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

        <div className="p-4 border-t border-border/50 bg-background/50">
          <div className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors rounded-lg hover:bg-muted/50">
            <Settings size={16} />
            <span>Preferences</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 justify-between bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3 md:hidden">
            <button onClick={() => setShowSidebar(true)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <Menu size={20} />
            </button>
            <span className="font-semibold text-sm">Gemini Code Pro</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Model Active: Gemini 2.5 Flash
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-medium px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
              Share Chat
            </button>
          </div>
        </header>

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
                    <div className="flex flex-wrap gap-2 mb-1">
                      {msg.attachments.map((file, i) => (
                        <div key={i} className="relative overflow-hidden rounded-lg border border-border w-40 h-28 bg-muted shadow-sm hover:shadow-md transition-shadow">
                           {file.type.startsWith('image/') ? (
                             <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                           ) : (
                             <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                               <Paperclip size={20} className="mb-2 opacity-50" />
                               <span className="text-xs text-muted-foreground truncate w-full">{file.name}</span>
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
                      <div className="flex items-center gap-2 mt-2 text-red-600 text-xs font-medium">
                        <AlertCircle size={14} />
                        <span>Generation Error</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Timestamp */}
                  <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Paperclip size={18} className="text-muted-foreground" />
                        </div>
                    )}
                    <button 
                      onClick={() => removeAttachment(idx)}
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
                      accept="image/*"
                      multiple
                    />
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                      title="Attach Image"
                    >
                      <Paperclip size={18} />
                      <span className="hidden sm:inline">Attach</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                     <span className="text-[10px] text-muted-foreground hidden sm:inline-block mr-2">
                       Enter to send, Shift+Enter for new line
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
                Gemini 2.5 Flash can make mistakes. Verify critical code and information.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;