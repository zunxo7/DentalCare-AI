// Authentication and user tracking utilities

interface AuthData {
  isAdmin: boolean;
  userId?: string | number; // Can be UUID (string) or number
  userName?: string;
  loginTime?: string;
}

const AUTH_KEY = 'dentalcare_auth';
const ADMIN_KEY = 'dentalcare_admin'; // Legacy key for backward compatibility

/**
 * Get authentication data from localStorage
 */
export const getAuthData = (): AuthData | null => {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    
    // Check legacy key for backward compatibility
    const legacyAdmin = localStorage.getItem(ADMIN_KEY);
    if (legacyAdmin === 'true') {
      const authData: AuthData = { isAdmin: true };
      setAuthData(authData);
      localStorage.removeItem(ADMIN_KEY); // Migrate to new format
      return authData;
    }
    
    return null;
  } catch (error) {
    console.error('Error reading auth data:', error);
    return null;
  }
};

/**
 * Set authentication data in localStorage
 */
export const setAuthData = (data: AuthData): void => {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving auth data:', error);
  }
};

/**
 * Check if user is admin
 */
export const isAdmin = (): boolean => {
  const authData = getAuthData();
  return authData?.isAdmin === true;
};

/**
 * Set admin status
 */
export const setAdminStatus = (isAdmin: boolean, userId?: string | number, userName?: string): void => {
  // Preserve existing userId and userName if not provided
  const existing = getAuthData();
  const authData: AuthData = {
    isAdmin,
    userId: userId ?? existing?.userId,
    userName: userName ?? existing?.userName,
    loginTime: new Date().toISOString(),
  };
  setAuthData(authData);
};

/**
 * Clear authentication data
 */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(ADMIN_KEY); // Also clear legacy key
};

/**
 * Update user info in auth data
 */
export const updateUserInfo = (userId: string | number, userName: string): void => {
  const authData = getAuthData() || { isAdmin: false };
  authData.userId = userId;
  authData.userName = userName;
  setAuthData(authData);
};

/**
 * Get current user ID from auth data
 */
export const getCurrentUserId = (): string | number | undefined => {
  const authData = getAuthData();
  return authData?.userId;
};

/**
 * Get current user name from auth data
 */
export const getCurrentUserName = (): string | undefined => {
  const authData = getAuthData();
  return authData?.userName;
};

