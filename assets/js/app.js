import { trackPageView, trackDiseaseView, trackRecipeView } from './analytics.js';
import { loadComments, renderCommentForm } from './comments.js';

const DISEASES = ['diabetes', 'heart-disease', 'obesity', 'hypertension'];
const cache = {};

function qs(sel) { return document.querySelector(sel); }

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.hidden = true);
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

async function loadDisease(id) {
  if (cache[id]) return cache[id];
  try {
    const res = await fetch(`data/${id}.json`);
    if (!res.ok) throw new Error('fetch failed');
    cache[id] = await res.json();
    return cache[id];
  } catch {
    return null;
  }
}

function renderNutritionRow(label, value, unit) {
  if (value === null || value === undefined) {
    return `<tr><td>${label}</td><td>Not available</td></tr>`;
  }
  return `<tr><td>${label}</td><td>${value}${unit ? ' ' + unit : ''}</td></tr>`;
}

function renderFoods(foods) {
  if (!foods || !foods.length) return '<p>No foods listed yet.</p>';
  return `
    <div class="table-scroll">
      <table class="foods-table">
        <thead>
          <tr>
            <th>Food</th>
            <th>Serving Size</th>
            <th>Frequency</th>
            <th>Why?</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${foods.map(f => `
            <tr>
              <td><strong>${f.name}</strong></td>
              <td data-label="Serving">${f.serving || '—'}</td>
              <td data-label="Frequency">${f.frequency || '—'}</td>
              <td data-label="Why?"><em>${f.why || '—'}</em></td>
              <td data-label="Notes">${f.notes || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecipe(recipe, diseaseId) {
  const card = document.createElement('article');
  card.className = 'recipe-card';
  card.dataset.recipeId = recipe.id;

  const header = document.createElement('button');
  header.className = 'recipe-toggle';
  header.setAttribute('aria-expanded', 'false');
  header.textContent = recipe.title || 'Untitled Recipe';

  const body = document.createElement('div');
  body.className = 'recipe-body';
  body.hidden = true;

  body.innerHTML = `
    <p class="recipe-desc">${recipe.description || ''}</p>
    <div class="recipe-meta">
      <span>Servings: ${recipe.servings ?? 'N/A'}</span>
      <span>Prep: ${recipe.prepMinutes ?? 'N/A'} min</span>
      <span>Cook: ${recipe.cookMinutes ?? 'N/A'} min</span>
    </div>
    ${recipe.ingredients?.length ? `
      <h4>Ingredients</h4>
      <ul class="ingredients-list">
        ${recipe.ingredients.map(i => `<li>${i.quantity} ${i.name}</li>`).join('')}
      </ul>
    ` : ''}
    ${recipe.instructions?.length ? `
      <h4>Instructions</h4>
      <ol class="instructions-list">
        ${recipe.instructions.map(s => `<li>${s}</li>`).join('')}
      </ol>
    ` : ''}
    ${recipe.nutritionPerServing && typeof recipe.nutritionPerServing === 'object' ? `
      <h4>Nutrition per serving</h4>
      <table class="nutrition-table">
        <tbody>
          ${renderNutritionRow('Calories', recipe.nutritionPerServing.calories, 'kcal')}
          ${renderNutritionRow('Carbohydrates', recipe.nutritionPerServing.carbohydratesGrams, 'g')}
          ${renderNutritionRow('Protein', recipe.nutritionPerServing.proteinGrams, 'g')}
          ${renderNutritionRow('Total Fat', recipe.nutritionPerServing.fatGrams, 'g')}
          ${renderNutritionRow('Saturated Fat', recipe.nutritionPerServing.saturatedFatGrams, 'g')}
          ${renderNutritionRow('Fiber', recipe.nutritionPerServing.fiberGrams, 'g')}
          ${renderNutritionRow('Sodium', recipe.nutritionPerServing.sodiumMilligrams, 'mg')}
        </tbody>
      </table>
    ` : ''}
    ${recipe.sources?.length ? `
      <p class="sources">Sources: ${recipe.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>`).join(', ')}</p>
    ` : ''}
  `;

  // Comments section
  const commentsSection = document.createElement('section');
  commentsSection.className = 'comments-section';
  const commentsTitle = document.createElement('h4');
  commentsTitle.textContent = 'Comments';
  commentsSection.appendChild(commentsTitle);
  const commentsList = document.createElement('div');
  commentsList.className = 'comments-list';
  commentsSection.appendChild(commentsList);
  const commentFormWrap = document.createElement('div');
  commentFormWrap.className = 'comment-form-wrap';
  commentsSection.appendChild(commentFormWrap);
  body.appendChild(commentsSection);

  let analyticsTracked = false;
  let commentsLoaded = false;

  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;

    if (!expanded) {
      if (!analyticsTracked) {
        analyticsTracked = true;
        trackRecipeView(recipe.id);
      }
      if (!commentsLoaded) {
        commentsLoaded = true;
        loadComments(recipe.id, commentsList);
        renderCommentForm(recipe.id, commentFormWrap, () => loadComments(recipe.id, commentsList));
      }
    }
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

async function renderDisease(id) {
  const section = document.getElementById(id);
  if (!section) return;
  section.innerHTML = '<p class="loading">Loading…</p>';

  const data = await loadDisease(id);
  if (!data) {
    section.innerHTML = '<p class="error">Could not load content for this section.</p>';
    return;
  }

  section.innerHTML = '';

  const h2 = document.createElement('h2');
  h2.textContent = data.name;
  section.appendChild(h2);

  if (data.overview) {
    const card = document.createElement('div');
    card.className = 'collapsible-card';
    const toggle = document.createElement('button');
    toggle.className = 'collapsible-toggle';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Overview';
    const body = document.createElement('div');
    body.className = 'collapsible-body';
    const p = document.createElement('p');
    p.textContent = data.overview;
    body.appendChild(p);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
    });
    card.appendChild(toggle);
    card.appendChild(body);
    section.appendChild(card);
  }

  if (data.nutritionGuidance?.length) {
    const guidanceSection = document.createElement('section');
    guidanceSection.className = 'nutrition-guidance';
    const h3 = document.createElement('h3');
    h3.textContent = 'Nutrition Guidance';
    guidanceSection.appendChild(h3);
    for (const g of data.nutritionGuidance) {
      const card = document.createElement('div');
      card.className = 'collapsible-card';
      const toggle = document.createElement('button');
      toggle.className = 'collapsible-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = g.title;
      const body = document.createElement('div');
      body.className = 'collapsible-body';
      body.hidden = true;
      const content = document.createElement('p');
      content.textContent = g.content;
      body.appendChild(content);
      if (g.sources?.length) {
        const src = document.createElement('p');
        src.className = 'sources';
        src.textContent = 'Sources: ';
        g.sources.forEach((s, i) => {
          const a = document.createElement('a');
          a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = s.label;
          src.appendChild(a);
          if (i < g.sources.length - 1) src.appendChild(document.createTextNode(', '));
        });
        body.appendChild(src);
      }
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        body.hidden = expanded;
      });
      card.appendChild(toggle);
      card.appendChild(body);
      guidanceSection.appendChild(card);
    }
    section.appendChild(guidanceSection);
  }

  if (data.foods?.length) {
    const foodsSection = document.createElement('section');
    foodsSection.className = 'foods-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Recommended Foods';
    foodsSection.appendChild(h3);
    const foodsHtml = document.createElement('div');
    foodsHtml.innerHTML = renderFoods(data.foods);
    foodsSection.appendChild(foodsHtml);
    section.appendChild(foodsSection);
  }

  if (data.recipes?.length) {
    const recipesSection = document.createElement('section');
    recipesSection.className = 'recipes-section';
    const h3 = document.createElement('h3');
    h3.textContent = 'Recipes';
    recipesSection.appendChild(h3);
    for (const r of data.recipes) {
      recipesSection.appendChild(renderRecipe(r, id));
    }
    section.appendChild(recipesSection);
  }
}

async function navigate() {
  const hash = location.hash.replace('#', '') || 'home';

  if (hash === 'home') {
    showSection('home');
    trackPageView();
    return;
  }

  if (DISEASES.includes(hash)) {
    showSection(hash);
    trackDiseaseView(hash);
    const section = document.getElementById(hash);
    if (section && section.innerHTML.trim() === '') {
      await renderDisease(hash);
    }
    return;
  }

  showSection('home');
}

window.addEventListener('hashchange', navigate);
window.addEventListener('load', navigate);

// Hamburger nav toggle
const hamburgerBtn = document.querySelector('.nav-hamburger');
const navLinks = document.querySelector('.nav-links');
if (hamburgerBtn && navLinks) {
  hamburgerBtn.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', String(open));
  });
  navLinks.addEventListener('click', e => {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }
  });
}
