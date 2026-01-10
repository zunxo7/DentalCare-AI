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
  filename: string;
  description?: string;
  type?: 'image' | 'video';
  created_at?: string;
}

export interface SuggestionChip {
  text_en: string;
  text_ur: string;
  text_roman: string;
  linked_faq_id: number;
}

export interface SuggestionGroup {
  id: number;
  keywords: string;
  chips_json: string; // Stored as JSON string in DB
  chips?: SuggestionChip[]; // Parsed for frontend
  created_at?: string;
}

export interface BotRequest {
  message: string;
  userName: string;
  userId?: string | null;
  suggestionFaqId?: number; // If present, bypasses AI and loads this FAQ directly
}

export interface BotResponse {
  text: string;
  mediaUrls: string[];
  faqId: number | null;
  queryId: string | null;
  suggestions?: SuggestionChip[]; // For short query suggestion chips
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
  suggestions?: SuggestionChip[];
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