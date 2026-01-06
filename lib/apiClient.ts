import type {
  FAQ,
  Media,
  DashboardStats,
  Conversation,
  ChatMessage,
  User,
} from '../types';

// Vercel automatically handles /api/* routing to Edge Functions
const API_BASE = '/api';

// Get admin password from environment variable
function getAdminPassword(): string | null {
  return import.meta.env.VITE_ADMIN_PASSWORD || null;
}

// Check if URL is a reports GET endpoint (admin-only)
// POST /api/reports is public (users can submit reports)
function isAdminEndpoint(url: string | Request, method?: string): boolean {
  const urlString = typeof url === 'string' ? url : url.url;
  const requestMethod = method || (typeof url === 'object' && 'method' in url ? url.method : undefined);

  // Reports admin endpoints
  if (urlString.includes('/api/reports')) {
    // POST /api/reports is public, everything else is admin
    return requestMethod !== 'POST';
  }

  return false;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  // Vercel automatically routes /api/* to Edge Functions
  // No URL transformation needed - use /api/* directly
  const url = typeof input === 'string' ? input : (input as Request).url;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init && init.headers),
  };

  // Add admin password header for admin-only endpoints
  const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : undefined);
  if (isAdminEndpoint(input, method)) {
    const adminPassword = getAdminPassword();
    if (adminPassword) {
      headers['x-admin-password'] = adminPassword;
    }
  }

  const res = await fetch(url, {
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
  media_urls?: string[] | string | null; // Can be array or JSON string
  query_id?: string | null;
  created_at: string;
};

// No AdminConversationRow needed anymore

function mapRawMessage(row: RawMessageRow): ChatMessage {
  // Parse media_urls if it's a JSON string
  let mediaUrls: string[] | undefined = undefined;
  if (row.media_urls) {
    if (typeof row.media_urls === 'string') {
      try {
        mediaUrls = JSON.parse(row.media_urls);
      } catch {
        // If parsing fails, treat as empty array
        mediaUrls = [];
      }
    } else if (Array.isArray(row.media_urls)) {
      mediaUrls = row.media_urls;
    }
  }

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender: row.sender,
    text: row.text,
    mediaUrls: mediaUrls,
    queryId: row.query_id ?? null,
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

  createFaq: (data: { question: string; answer: string; intent: string; media_ids?: number[] }) =>
    request<FAQ>(`${API_BASE}/faqs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFaq: (id: number, data: { question: string; answer: string; intent: string; media_ids?: number[] }) =>
    request<FAQ>(`${API_BASE}/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  generateIntent: (question: string) =>
    request<{ intent: string }>(`${API_BASE}/faqs/generate-intent`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),

  deleteFaq: (id: number) =>
    request<void>(`${API_BASE}/faqs/${id}`, { method: 'DELETE' }),



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



  // Stats
  getStats: () => request<DashboardStats>(`${API_BASE}/stats`),

  resetAllUserData: () =>
    request<{ success: boolean; message: string }>(`${API_BASE}/reset-all-user-data`, {
      method: 'DELETE',
    }),

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
    queryId?: string | null;
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




  // Reports
  createReport: (data: {
    userId?: string | null;
    queryId?: string | null;
    reportType: string;
    userQuery?: string | null;
    botResponse?: string | null;
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
    request<{ success: boolean; message: string }>(`${API_BASE}/reports`, {
      method: 'DELETE',
      body: JSON.stringify({ id: reportId }),
    }),

  deleteReports: () =>
    request<{ success: boolean; message: string }>(`${API_BASE}/reports`, {
      method: 'DELETE',
    }),

  // Report categories
  getReportCategories: () =>
    request<{ success: boolean; categories: Array<{ name: string; order: number }> }>(`${API_BASE}/reports/categories`),

  addReportCategory: (name: string) =>
    request<{ success: boolean; category: any }>(`${API_BASE}/reports/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteReportCategory: (name: string) =>
    request<{ success: boolean }>(`${API_BASE}/reports/categories`, {
      method: 'DELETE',
      body: JSON.stringify({ name }),
    }),

  reorderReportCategories: (name: string, sourceIndex: number, targetIndex: number) =>
    request<{ success: boolean }>(`${API_BASE}/reports/categories/reorder`, {
      method: 'POST',
      body: JSON.stringify({ name, sourceIndex, targetIndex }),
    }),

  // Chat/Bot endpoint (Vercel Edge Function)
  getBotResponse: async (data: {
    message: string;
    userName: string;
    userId?: string | null;
  }) => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      let message = `Request failed with status ${res.status}`;
      try {
        const errorData: any = await res.json();
        if (errorData && typeof errorData.error === 'string') {
          message = errorData.error;
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return (await res.json()) as {
      text: string;
      mediaUrls: string[];
      faqId: number | null;
      queryId: string | null;
      pipelineLogs?: string[];
    };
  },
};

