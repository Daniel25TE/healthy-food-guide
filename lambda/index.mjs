import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';

const VALID_ID = /^[a-zA-Z0-9-]{1,100}$/;
const VALID_EVENT_TYPES = new Set(['page_view', 'disease_view', 'recipe_view']);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value) {
  return createHash('sha256').update(value).digest('hex');
}

export const handler = async (event) => {
  const origin = event.headers?.origin || '';
  const method = event.requestContext?.http?.method || event.httpMethod || '';
  const path = event.requestContext?.http?.path || event.path || '';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  // POST /events
  if (method === 'POST' && path === '/events') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON' }, origin); }

    const { eventType, entityId, visitorId } = body;
    if (!VALID_EVENT_TYPES.has(eventType)) return response(400, { error: 'Invalid eventType' }, origin);
    if (!entityId || !VALID_ID.test(entityId)) return response(400, { error: 'Invalid entityId' }, origin);

    const date = utcDate();
    const pk = `analytic#${eventType}#${entityId}`;
    const sk = `total`;

    // Increment total view counter
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1 },
    }));

    // Track unique visitor (hash of visitorId + date + scope)
    if (visitorId && typeof visitorId === 'string' && visitorId.length < 200) {
      const markerKey = hashString(`${visitorId}:${date}:${eventType}:${entityId}`);
      const markerPk = `uniquemarker#${markerKey}`;
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: markerPk, SK: 'marker' } }));
      if (!existing.Item) {
        const ttl = Math.floor(Date.now() / 1000) + 48 * 3600;
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Key: { PK: markerPk, SK: 'marker' },
          Item: { PK: markerPk, SK: 'marker', expiresAt: ttl },
          ConditionExpression: 'attribute_not_exists(PK)',
        })).catch(() => {}); // race-safe: ignore conditional check failure

        // Increment unique counter
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: pk, SK: `unique#${date}` },
          UpdateExpression: 'ADD #c :one',
          ExpressionAttributeNames: { '#c': 'count' },
          ExpressionAttributeValues: { ':one': 1 },
        }));
      }
    }

    return response(200, { ok: true }, origin);
  }

  // GET /comments/{recipeId}
  const commentMatch = path.match(/^\/comments\/([^/]+)$/);
  if (commentMatch) {
    const recipeId = decodeURIComponent(commentMatch[1]);
    if (!VALID_ID.test(recipeId)) return response(400, { error: 'Invalid recipeId' }, origin);

    if (method === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `recipe#${recipeId}`, ':sk': 'comment#' },
        ScanIndexForward: true,
      }));
      const comments = (result.Items || []).map(i => ({
        id: i.commentId,
        displayName: i.displayName,
        message: i.message,
        createdAt: i.createdAt,
      }));
      return response(200, comments, origin);
    }

    if (method === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON' }, origin); }

      // Honeypot check
      if (body.honeypot) return response(400, { error: 'Bad request' }, origin);

      const displayName = (body.displayName || '').trim();
      const message = (body.message || '').trim();

      if (!displayName || displayName.length > 40) return response(400, { error: 'displayName must be 1–40 characters' }, origin);
      if (!message || message.length > 1000) return response(400, { error: 'message must be 1–1000 characters' }, origin);

      // Rate limiting by hashed IP
      const rawIp = event.requestContext?.http?.sourceIp || 'unknown';
      const date = utcDate();
      const ipHash = hashString(`${rawIp}:${date}:rl-secret`);
      const rlPk = `ratelimit#${ipHash}`;
      const rlItem = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: rlPk, SK: 'count' } }));
      const currentCount = rlItem.Item?.count || 0;
      if (currentCount >= 10) return response(429, { error: 'Too many comments. Try again tomorrow.' }, origin);

      // Store comment
      const commentId = randomUUID();
      const createdAt = new Date().toISOString();
      const sk = `comment#${createdAt}#${commentId}`;
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { PK: `recipe#${recipeId}`, SK: sk, commentId, displayName, message, createdAt },
      }));

      // Increment rate limit counter with TTL
      const ttl = Math.floor(Date.now() / 1000) + 24 * 3600;
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: rlPk, SK: 'count' },
        UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':ttl': ttl },
      }));

      return response(201, { id: commentId, displayName, message, createdAt }, origin);
    }
  }

  return response(404, { error: 'Not found' }, origin);
};
