export interface FAQ {
  id: number;
  question: string;
  answer: string;
  intent: string; // Canonical intent phrase (required)
  asked_count: number;
  created_at: string;
  embedding?: number[];
  language?: string;
  media_ids?: number[];
}

export interface Media {
  id: number;
  title: string;
  type: 'video' | 'image' | 'document';
  url: string;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string; // Formatted time string for live chat display
  mediaUrls?: string[];
  created_at: string; // ISO string for precise time
  queryId?: string | null; // For linking to logs
}

export interface User {
  id: string; // UUID
  name: string;
  created_at: string;
}

export interface UserWithStats extends User {
  message_count: number;
  last_active: string;
  time_spent?: number;
}

export interface Conversation {
    id: number;
    user_id: string;
    created_at: string;
    title?: string; // Optional: For display in a chat list, using the first message.
    is_deleted_by_user?: boolean;
}

export interface ConversationWithStats extends Conversation {
    message_count?: number;
    time_spent?: number; // in seconds
    last_message_at?: string;
    user?: { name: string | null }; // For joining user data
}


export interface DashboardStats {
  totalMessages: number;
  uniqueUsers: number; // This will now represent total conversations
  totalFaqs: number;
  conversationTime: number; // in seconds
}