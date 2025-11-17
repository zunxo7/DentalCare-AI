import type {
  FAQ,
  Media,
  DashboardStats,
  Conversation,
  ChatMessage,
  User,
} from '../types';

const API_BASE = '/api';

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
    ...init,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data: any = await res.json();
      if (data && typeof data.error === 'string') {
        message = data.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

type RawMessageRow = {
  id: number;
  conversation_id: number;
  sender: 'user' | 'bot';
  text: string;
  media_urls?: string[] | null;
  created_at: string;
};

type AdminConversationRow = Conversation & {
  user: { id: string; name: string | null; created_at: string };
};

function mapRawMessage(row: RawMessageRow): ChatMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender: row.sender,
    text: row.text,
    mediaUrls: row.media_urls ?? undefined,
    created_at: row.created_at,
    timestamp: new Date(row.created_at).toLocaleString(),
  };
}

export const api = {
  // FAQs
getFaqs: async () => {
  const data = await request<FAQ[]>(`${API_BASE}/faqs`);
  return data.map(f => ({
    ...f,
    keywords: f.keywords ?? [],   // FIX here
  }));
},

createFaq: (data: { question: string; answer: string; keywords?: string[] }) =>
    request<FAQ>(`${API_BASE}/faqs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFaq: (id: number, data: { question: string; answer: string; keywords?: string[] }) =>
    request<FAQ>(`${API_BASE}/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteFaq: (id: number) =>
    request<void>(`${API_BASE}/faqs/${id}`, { method: 'DELETE' }),

  deleteAllFaqs: () =>
    request<void>(`${API_BASE}/faqs`, { method: 'DELETE' }),

  incrementFaqCount: (id: number) =>
    request<void>(`${API_BASE}/faqs/${id}/increment`, { method: 'POST' }),

  // Media
  getMedia: () => request<Media[]>(`${API_BASE}/media`),

  createMedia: (data: {
    title: string;
    url: string;
    type: Media['type'];
    keywords: string[];
  }) =>
    request<Media>(`${API_BASE}/media`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMedia: (
    id: number,
    data: {
      title: string;
      url: string;
      type: Media['type'];
      keywords: string[];
    }
  ) =>
    request<Media>(`${API_BASE}/media/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMedia: (id: number) =>
    request<void>(`${API_BASE}/media/${id}`, { method: 'DELETE' }),

  deleteAllMedia: () =>
    request<void>(`${API_BASE}/media`, { method: 'DELETE' }),

  // Stats
  getStats: () => request<DashboardStats>(`${API_BASE}/stats`),

  // Users
  getUser: (id: string) => request<User>(`${API_BASE}/users/${id}`),

  createUser: (name: string) =>
    request<User>(`${API_BASE}/users`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // Conversations & messages (chat user)
  getUserConversations: (userId: string) =>
    request<Conversation[]>(`${API_BASE}/users/${userId}/conversations`),

  createConversation: (userId: string, title: string) =>
    request<Conversation>(`${API_BASE}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ userId, title }),
    }),

  softDeleteConversation: (conversationId: number) =>
    request<void>(`${API_BASE}/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDeletedByUser: true }),
    }),

  getConversationMessages: async (conversationId: number) => {
    const rows = await request<RawMessageRow[]>(
      `${API_BASE}/conversations/${conversationId}/messages`
    );
    return rows.map(mapRawMessage);
  },

  createMessage: async (payload: {
    conversationId: number;
    sender: 'user' | 'bot';
    text: string;
    mediaUrls?: string[];
  }) => {
    const row = await request<RawMessageRow>(`${API_BASE}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapRawMessage(row);
  },


getAllMedia: async () => {
    try {
        const res = await fetch(`${API_BASE}/media`);
        if (!res.ok) throw new Error("Failed to fetch media");
        return await res.json();
    } catch (e) {
        console.error("getAllMedia error:", e);
        return [];
    }
},


  // Admin
  getAdminConversationsWithUsers: () =>
    request<AdminConversationRow[]>(
      `${API_BASE}/admin/conversations-with-users`
    ),

  getMessagesForConversation: (conversationId: number) =>
    api.getConversationMessages(conversationId),

  // Dangerous actions
  resetAllUserData: () =>
    request<void>(`${API_BASE}/reset-all-user-data`, { method: 'POST' }),
};

