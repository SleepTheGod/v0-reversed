export interface FileAttachment {
  name: string;
  type: string;
  data: string; // base64 encoded data
  preview: string; // data url for preview
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachments?: FileAttachment[];
  timestamp: number;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string;
  isLoading: boolean;
}