export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const SERVER_PUBLIC_KEY = process.env.SERVER_PUBLIC_KEY || '-----BEGIN PUBLIC KEY-----\\nREPLACE_ME\\n-----END PUBLIC KEY-----';
export const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\\nREPLACE_ME\\n-----END PRIVATE KEY-----';
export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/resq_link';
export const PGSSL = process.env.PGSSL === 'true';
export const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';
