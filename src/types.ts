export type UserRole = 'admin' | 'level2' | 'level3';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  sector?: string;
}

export interface AnalysisNode {
  id: string;
  status: 'active' | 'idle' | 'offline';
  accuracy: number;
  lastSync: string;
}

export interface FileData {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  status: 'processed' | 'pending' | 'error';
}

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
}
