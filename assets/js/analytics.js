import { postEvent } from './api.js';

function getVisitorId() {
  let id = localStorage.getItem('hfg_visitor_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('hfg_visitor_id', id);
  }
  return id;
}

const tracked = new Set();

function sendEvent(eventType, entityId) {
  const key = `${eventType}:${entityId}`;
  if (tracked.has(key)) return;
  tracked.add(key);
  const visitorId = getVisitorId();
  postEvent(eventType, entityId, visitorId);
}

export function trackPageView() {
  sendEvent('page_view', 'site');
}

export function trackDiseaseView(diseaseId) {
  sendEvent('disease_view', diseaseId);
}

export function trackRecipeView(recipeId) {
  sendEvent('recipe_view', recipeId);
}
