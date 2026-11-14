// Set this to your deployed API Gateway URL after running `cdk deploy`
// Example: 'https://abc123.execute-api.us-east-1.amazonaws.com'
export const API_BASE_URL = 'https://mx5ul6p3a0.execute-api.us-east-1.amazonaws.com';

export async function postEvent(eventType, entityId) {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, entityId }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function getComments(recipeId) {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/comments/${encodeURIComponent(recipeId)}`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function postComment(recipeId, displayName, message, honeypot) {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/comments/${encodeURIComponent(recipeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, message, honeypot }),
    });
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
  } catch {
    return null;
  }
}
