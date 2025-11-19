import type {
  FAQ,
  Media,
  DashboardStats,
  Conversation,
  ChatMessage,
  User,
} from '../types';

const API_BASE = '/api';

// Get admin password from environment variable
function getAdminPassword(): string | null {
  return import.meta.env.VITE_ADMIN_PASSWORD || null;
}

// Check if URL is a debug or reports endpoint
function isAdminEndpoint(url: string | Request): boolean {
  const urlString = typeof url === 'string' ? url : url.url;
  return urlString.includes('/api/debug/') || urlString.includes('/api/reports');
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init && init.headers),
  };

  // Add admin password header for debug/reports endpoints
  if (isAdminEndpoint(input)) {
    const adminPassword = getAdminPassword();
    if (adminPassword) {
      headers['x-admin-password'] = adminPassword;
    }
  }

  const res = await fetch(input, {
    headers,
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
  return data;
},

createFaq: (data: { question: string; answer: string }) =>
    request<FAQ>(`${API_BASE}/faqs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFaq: (id: number, data: { question: string; answer: string }) =>
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

  // Reports
  createReport: (data: {
    userId?: string | null;
    queryId?: string | null;
    reportType: string;
  }) =>
    request<{ success: boolean; report: any }>(`${API_BASE}/reports`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getReports: () =>
    request<{ success: boolean; reports: any[] }>(`${API_BASE}/reports`),
  
  updateReportStatus: (reportId: number, status: 'active' | 'resolved') =>
    request<{ success: boolean; report: any }>(`${API_BASE}/reports/${reportId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  deleteReport: (reportId: number) =>
    request<{ success: boolean; message: string }>(`${API_BASE}/reports/${reportId}`, {
      method: 'DELETE',
    }),
};

