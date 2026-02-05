import crypto from 'crypto';

export const signPayload = (payload: string, secret: string): string => {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
};
