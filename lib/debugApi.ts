// Helper function for debug API calls that automatically includes admin authentication

const API_BASE = '/api';

// Get admin password from environment variable
function getAdminPassword(): string | null {
  return import.meta.env.VITE_ADMIN_PASSWORD || null;
}

// Helper function to add admin password header to fetch requests
function getAdminHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  const adminPassword = getAdminPassword();
  if (adminPassword) {
    headers['x-admin-password'] = adminPassword;
  }
  
  return headers;
}

export async function debugFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...getAdminHeaders(),
      ...(options.headers || {}),
    },
  });
}

