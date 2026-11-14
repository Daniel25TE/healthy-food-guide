import { getComments, postComment } from './api.js';
import { API_BASE_URL } from './api.js';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export async function loadComments(recipeId, containerEl) {
  if (!API_BASE_URL) {
    containerEl.textContent = 'Comments require a connection to the server. The educational content above is always available offline.';
    return;
  }
  containerEl.textContent = 'Loading comments…';
  const comments = await getComments(recipeId);
  containerEl.innerHTML = '';
  if (!comments.length) {
    const p = document.createElement('p');
    p.className = 'no-comments';
    p.textContent = 'No comments yet. Be the first!';
    containerEl.appendChild(p);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'comment-list';
  for (const c of comments) {
    const li = document.createElement('li');
    li.className = 'comment-item';
    const header = document.createElement('div');
    header.className = 'comment-header';
    const name = document.createElement('strong');
    name.textContent = c.displayName;
    const date = document.createElement('span');
    date.className = 'comment-date';
    date.textContent = formatDate(c.createdAt);
    header.appendChild(name);
    header.appendChild(date);
    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.message; // textContent — never innerHTML
    li.appendChild(header);
    li.appendChild(body);
    list.appendChild(li);
  }
  containerEl.appendChild(list);
}

export function renderCommentForm(recipeId, containerEl, onSuccess) {
  containerEl.innerHTML = '';

  const notice = document.createElement('p');
  notice.className = 'comment-notice';
  notice.textContent = 'Comments are public. Do not include personal or medical information.';
  containerEl.appendChild(notice);

  if (!API_BASE_URL) {
    const msg = document.createElement('p');
    msg.className = 'api-offline';
    msg.textContent = 'Comments require a connection to the server. The educational content above is always available offline.';
    containerEl.appendChild(msg);
    return;
  }

  const form = document.createElement('form');
  form.className = 'comment-form';
  form.noValidate = true;

  // Honeypot (hidden via CSS)
  const honeypotWrap = document.createElement('div');
  honeypotWrap.className = 'honeypot-field';
  const honeypotInput = document.createElement('input');
  honeypotInput.type = 'text';
  honeypotInput.name = 'website';
  honeypotInput.tabIndex = -1;
  honeypotInput.autocomplete = 'off';
  honeypotWrap.appendChild(honeypotInput);
  form.appendChild(honeypotWrap);

  // Display name
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Display name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 40;
  nameInput.required = true;
  nameInput.placeholder = 'Your name (1–40 characters)';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  // Message
  const msgLabel = document.createElement('label');
  msgLabel.textContent = 'Comment';
  const msgTextarea = document.createElement('textarea');
  msgTextarea.maxLength = 1000;
  msgTextarea.required = true;
  msgTextarea.rows = 4;
  msgTextarea.placeholder = 'Share your thoughts (1–1000 characters)';
  const charCount = document.createElement('span');
  charCount.className = 'char-count';
  charCount.textContent = '0 / 1000';
  msgTextarea.addEventListener('input', () => {
    charCount.textContent = `${msgTextarea.value.length} / 1000`;
  });
  msgLabel.appendChild(msgTextarea);
  msgLabel.appendChild(charCount);
  form.appendChild(msgLabel);

  const errorEl = document.createElement('p');
  errorEl.className = 'form-error';
  errorEl.hidden = true;
  form.appendChild(errorEl);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Post comment';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const name = nameInput.value.trim();
    const msg = msgTextarea.value.trim();
    const honeypot = honeypotInput.value;

    if (!name || name.length > 40) {
      errorEl.textContent = 'Display name must be 1–40 characters.';
      errorEl.hidden = false;
      return;
    }
    if (!msg || msg.length > 1000) {
      errorEl.textContent = 'Comment must be 1–1000 characters.';
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

    const result = await postComment(recipeId, name, msg, honeypot);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post comment';

    if (!result) {
      errorEl.textContent = 'Could not connect to server. Please try again later.';
      errorEl.hidden = false;
      return;
    }
    if (result.status === 429) {
      errorEl.textContent = 'You have posted too many comments. Please wait before trying again.';
      errorEl.hidden = false;
      return;
    }
    if (!result.ok) {
      errorEl.textContent = 'Could not post comment. Please check your input and try again.';
      errorEl.hidden = false;
      return;
    }

    nameInput.value = '';
    msgTextarea.value = '';
    charCount.textContent = '0 / 1000';
    if (onSuccess) onSuccess();
  });

  containerEl.appendChild(form);
}
