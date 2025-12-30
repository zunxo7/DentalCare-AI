/**
 * Turso database client configuration
 */

import { createClient } from '@libsql/client';

const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';

export const turso = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken || undefined,
});

