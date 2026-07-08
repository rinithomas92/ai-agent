const state = {
  posts: [],
  selectedId: null,
  uploadedImage: null
};

const els = {
  form: document.querySelector('#planForm'),
  status: document.querySelector('#formStatus'),
  calendar: document.querySelector('#calendar'),
  selected: document.querySelector('#selectedPost'),
  scheduled: document.querySelector('#scheduledCount'),
  published: document.querySelector('#publishedCount'),
  failed: document.querySelector('#failedCount'),
  nextPost: document.querySelector('#nextPost'),
  refresh: document.querySelector('#refresh'),
  runDue: document.querySelector('#runDue'),
  imageUpload: document.querySelector('#imageUpload'),
  uploadPreview: document.querySelector('#uploadPreview')
};

document.querySelector('[name="startDate"]').valueAsDate = new Date();

els.imageUpload.addEventListener('change', () => {
  const file = els.imageUpload.files?.[0];
  if (!file) {
    state.uploadedImage = null;
    els.uploadPreview.innerHTML = '<span>No image uploaded</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  els.uploadPreview.innerHTML = `<img src="${url}" alt="Uploaded preview"><span>${escapeHtml(file.name)}</span>`;
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.form));
  data.days = Number(data.days);
  data.animation = Boolean(data.animation);
  data.agentMode = Boolean(data.agentMode);
  delete data.imageUpload;
  els.status.textContent = 'Generating schedule...';

  try {
    const file = els.imageUpload.files?.[0];
    if (file) {
      els.status.textContent = 'Uploading image...';
      const imageData = await readFileAsDataUrl(file);
      state.uploadedImage = await api('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({ imageData, filename: file.name })
      });
      data.uploadedImagePath = state.uploadedImage.publicPath;
    } else if (state.uploadedImage?.publicPath) {
      data.uploadedImagePath = state.uploadedImage.publicPath;
    }

    els.status.textContent = 'Generating branded posts...';
    await api('/api/plan', { method: 'POST', body: JSON.stringify(data) });
    els.status.textContent = 'Schedule created. Downloads are ready.';
    await loadPosts();
  } catch (error) {
    els.status.textContent = error.message;
  }
});

els.refresh.addEventListener('click', loadPosts);
els.runDue.addEventListener('click', async () => {
  await api('/api/run-due', { method: 'POST' });
  await loadPosts();
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

async function loadPosts() {
  state.posts = await api('/api/posts');
  renderStats();
  renderCalendar();
  renderSelected();
}

function renderStats() {
  const counts = state.posts.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {});
  els.scheduled.textContent = counts.scheduled || 0;
  els.published.textContent = counts.published || 0;
  els.failed.textContent = counts.failed || 0;
  const next = state.posts.find((post) => post.status === 'scheduled');
  els.nextPost.textContent = next ? formatDate(next.scheduledAt, true) : '--';
}

function renderCalendar() {
  els.calendar.innerHTML = '';
  if (!state.posts.length) {
    els.calendar.innerHTML = '<div class="empty-state">Generate a plan to fill the calendar.</div>';
    return;
  }

  const first = new Date(state.posts[0].scheduledAt);
  const last = new Date(state.posts[state.posts.length - 1].scheduledAt);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  while (cursor <= end) {
    const day = document.createElement('div');
    day.className = 'day';
    const iso = cursor.toISOString().slice(0, 10);
    day.innerHTML = `<div class="day-number">${cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>`;
    for (const post of state.posts.filter((item) => item.scheduledAt.slice(0, 10) === iso)) {
      const chip = document.createElement('button');
      chip.className = `post-chip ${post.status}`;
      chip.textContent = `${post.category} - ${post.status}`;
      chip.addEventListener('click', () => {
        state.selectedId = post.id;
        renderSelected();
      });
      day.appendChild(chip);
    }
    els.calendar.appendChild(day);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function renderSelected() {
  const post = state.posts.find((item) => item.id === state.selectedId) || state.posts[0];
  if (!post) {
    els.selected.className = 'empty-state';
    els.selected.textContent = 'Choose a post from the calendar.';
    return;
  }
  state.selectedId = post.id;
  const handle = post.instagramHandle || '@getholisticallyfitwithrini';
  els.selected.className = 'selected-card';
  els.selected.innerHTML = `
    <img src="${post.imagePath}" alt="Generated quote card">
    <div>
      <p class="meta">${formatDate(post.scheduledAt, true)} - ${post.status}</p>
      <h3 class="quote">${escapeHtml(post.quote)}</h3>
      <p>${escapeHtml(post.caption)}</p>
      <p class="meta">${escapeHtml(post.creatorName || 'Rini')} - ${escapeHtml(handle)}</p>
      <p class="meta">${post.hashtags.map(escapeHtml).join(' ')}</p>
      ${post.videoUrl ? `<p class="meta">Video: <a href="${post.videoUrl}" target="_blank">open</a></p>` : ''}
      ${post.grokImageUrl ? `<p class="meta">Grok image: <a href="${post.grokImageUrl}" target="_blank">open</a></p>` : ''}
      ${post.error ? `<p class="meta">Error: ${escapeHtml(post.error)}</p>` : ''}
      ${renderAgentReview(post)}
      <div class="actions">
        <a class="ghost-button link-button" href="${post.imagePath}" download="instagram-post-${post.scheduledAt.slice(0, 10)}.svg">Download Post</a>
        <button class="ghost-button" data-action="regenerate">Regenerate</button>
        <button class="ghost-button" data-action="grok-image">Grok Image</button>
        <button class="ghost-button" data-action="animate">Animate</button>
        <button class="primary-button compact-primary" data-action="publish">Publish Now</button>
      </div>
    </div>
  `;
  els.selected.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const action = button.dataset.action;
      try {
        await api(`/api/posts/${post.id}/${action}`, { method: 'POST' });
      } catch (error) {
        alert(error.message);
      }
      await loadPosts();
    });
  });
}

function renderAgentReview(post) {
  if (!post.agentMode && !post.agentStrategy && !post.agentMission) return '';
  const pillars = post.agentStrategy?.contentPillars?.length
    ? `<p class="meta">Pillars: ${post.agentStrategy.contentPillars.map(escapeHtml).join(', ')}</p>`
    : '';
  const score = typeof post.agentQualityScore === 'number' ? `${post.agentQualityScore}/10` : 'not scored';
  return `
    <div class="agent-review">
      <strong>Agent Review</strong>
      <p>Quality score: ${escapeHtml(score)}</p>
      ${post.agentMission ? `<p>Mission: ${escapeHtml(post.agentMission)}</p>` : ''}
      ${post.agentStrategy?.strategySummary ? `<p>Strategy: ${escapeHtml(post.agentStrategy.strategySummary)}</p>` : ''}
      ${pillars}
      ${post.agentRationale ? `<p class="meta">${escapeHtml(post.agentRationale)}</p>` : ''}
    </div>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

loadPosts();
