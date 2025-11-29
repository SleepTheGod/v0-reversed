export interface FileAttachment {
  name: string;
  type: string;
  data: string; // base64 encoded data
  preview: string; // data url for preview
  isText?: boolean; // track if it is a text file
  textContent?: string; // raw text content for code files
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachments?: FileAttachment[];
  timestamp: number;
  error?: boolean;
  isPreviewable?: boolean; // Does this message contain renderable code?
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastModified: number;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string;
  isLoading: boolean;
}