const state = {
  posts: [],
  selectedId: null,
  uploadedImage: null,
  uploadedReferencePost: null,
  uploadedSourceFile: null,
  uploadedCartoonImage: null
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
  clearSchedule: document.querySelector('#clearSchedule'),
  clearReferencePost: document.querySelector('#clearReferencePost'),
  imageUpload: document.querySelector('#imageUpload'),
  uploadPreview: document.querySelector('#uploadPreview'),
  referencePostUpload: document.querySelector('#referencePostUpload'),
  referencePostPreview: document.querySelector('#referencePostPreview'),
  sourceFileUpload: document.querySelector('#sourceFileUpload'),
  sourceFilePreview: document.querySelector('#sourceFilePreview'),
  daysInput: document.querySelector('#daysInput'),
  postsPerDayInput: document.querySelector('#postsPerDayInput'),
  postTimesContainer: document.querySelector('#postTimesContainer'),
  scheduleSummary: document.querySelector('#scheduleSummary'),
  cartoonForm: document.querySelector('#cartoonForm'),
  cartoonStatus: document.querySelector('#cartoonStatus'),
  cartoonPreview: document.querySelector('#cartoonPreview'),
  cartoonImageUpload: document.querySelector('#cartoonImageUpload'),
  cartoonImagePreview: document.querySelector('#cartoonImagePreview')
};

document.querySelector('[name="startDate"]').valueAsDate = new Date();
renderPostTimeInputs();
updateScheduleSummary();

els.postsPerDayInput.addEventListener('input', () => {
  renderPostTimeInputs();
  updateScheduleSummary();
});

els.daysInput.addEventListener('input', updateScheduleSummary);

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

els.referencePostUpload.addEventListener('change', () => {
  const file = els.referencePostUpload.files?.[0];
  if (!file) {
    state.uploadedReferencePost = null;
    els.referencePostPreview.innerHTML = '<span>No reference post uploaded</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  els.referencePostPreview.innerHTML = `
    <img src="${url}" alt="Reference post preview">
    <div>
      <strong>${escapeHtml(file.name)}</strong>
      <p class="meta">The agent will use this as visual inspiration for similar posts.</p>
    </div>
  `;
});

els.sourceFileUpload.addEventListener('change', () => {
  const file = els.sourceFileUpload.files?.[0];
  state.uploadedSourceFile = null;
  if (!file) {
    els.sourceFilePreview.innerHTML = '<span>No source file uploaded</span>';
    return;
  }
  els.sourceFilePreview.innerHTML = `
    <div>
      <strong>${escapeHtml(file.name)}</strong>
      <p class="meta">${formatBytes(file.size)} selected. It will be read by the agent when you generate the schedule.</p>
    </div>
  `;
});

els.cartoonImageUpload.addEventListener('change', () => {
  const file = els.cartoonImageUpload.files?.[0];
  state.uploadedCartoonImage = null;
  if (!file) {
    els.cartoonImagePreview.innerHTML = '<span>No cartoon image uploaded</span>';
    return;
  }
  const url = URL.createObjectURL(file);
  els.cartoonImagePreview.innerHTML = `
    <img src="${url}" alt="Cartoon reference preview">
    <div>
      <strong>${escapeHtml(file.name)}</strong>
      <p class="meta">This image will be blended into each generated cartoon video.</p>
    </div>
  `;
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.form));
  data.days = Number(data.days);
  data.postsPerDay = Number(data.postsPerDay);
  data.postTimes = [...els.postTimesContainer.querySelectorAll('input[name="postTimes"]')]
    .map((input) => input.value)
    .filter(Boolean);
  data.postTime = data.postTimes[0] || '09:00';
  data.animation = Boolean(data.animation);
  data.agentMode = Boolean(data.agentMode);
  data.replaceExistingSchedule = Boolean(data.replaceExistingSchedule);
  delete data.imageUpload;
  delete data.referencePostUpload;
  delete data.sourceFileUpload;
  els.status.textContent = 'Generating schedule...';

  try {
    if (data.postTimes.length !== data.postsPerDay) {
      throw new Error('Please set one posting time for every daily post.');
    }

    if (new Set(data.postTimes).size !== data.postTimes.length) {
      throw new Error('Each daily post must have a different posting time.');
    }

    data.uploadedImagePath = await ensureUploadedPortrait();

    const referencePostFile = els.referencePostUpload.files?.[0];
    if (referencePostFile) {
      els.status.textContent = 'Uploading reference post...';
      const imageData = await readFileAsDataUrl(referencePostFile);
      state.uploadedReferencePost = await api('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({ imageData, filename: referencePostFile.name })
      });
      data.referencePostImagePath = state.uploadedReferencePost.publicPath;
      els.referencePostPreview.innerHTML = `
        <img src="${state.uploadedReferencePost.publicPath}" alt="Reference post preview">
        <div>
          <strong>${escapeHtml(state.uploadedReferencePost.originalName)}</strong>
          <p class="meta">Reference post ready for visual style matching.</p>
        </div>
      `;
    } else if (state.uploadedReferencePost?.publicPath) {
      data.referencePostImagePath = state.uploadedReferencePost.publicPath;
    }

    const sourceFile = els.sourceFileUpload.files?.[0];
    if (sourceFile) {
      els.status.textContent = 'Reading source file...';
      const fileData = await readFileAsDataUrl(sourceFile);
      state.uploadedSourceFile = await api('/api/source-files', {
        method: 'POST',
        body: JSON.stringify({ fileData, filename: sourceFile.name })
      });
      data.sourceFileId = state.uploadedSourceFile.id;
      els.sourceFilePreview.innerHTML = `
        <div>
          <strong>${escapeHtml(state.uploadedSourceFile.filename)}</strong>
          <p class="meta">${escapeHtml(state.uploadedSourceFile.summary || 'Source file ready.')}</p>
          <p class="meta">${state.uploadedSourceFile.characterCount} readable characters${state.uploadedSourceFile.truncated ? ' (truncated for prompt safety)' : ''}</p>
        </div>
      `;
    } else if (state.uploadedSourceFile?.id) {
      data.sourceFileId = state.uploadedSourceFile.id;
    }

    const totalPosts = data.days * data.postsPerDay;
    els.status.textContent = `Agent is creating ${totalPosts} post${totalPosts === 1 ? '' : 's'}${data.sourceFileId ? ' from your source file' : ''}...`;
    const created = await api('/api/plan', { method: 'POST', body: JSON.stringify(data) });
    els.status.textContent = `${created.length} post${created.length === 1 ? '' : 's'} scheduled successfully.`;
    state.selectedId = created[0]?.id || null;
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

async function ensureUploadedPortrait() {
  const file = els.imageUpload.files?.[0];
  if (file) {
    els.status.textContent = 'Uploading image...';
    const imageData = await readFileAsDataUrl(file);
    state.uploadedImage = await api('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ imageData, filename: file.name })
    });
    return state.uploadedImage.publicPath;
  }
  return state.uploadedImage?.publicPath || null;
}

els.clearSchedule.addEventListener('click', async () => {
  const confirmed = window.confirm('Clear all scheduled posts? This cannot be undone.');
  if (!confirmed) return;

  els.status.textContent = 'Clearing schedule...';
  try {
    await api('/api/posts', { method: 'DELETE' });
    state.selectedId = null;
    els.status.textContent = 'Schedule cleared.';
    await loadPosts();
  } catch (error) {
    els.status.textContent = error.message;
  }
});

els.cartoonForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.cartoonForm));
  data.duration = Number(data.duration);
  data.days = Number(data.days);
  data.voice = Boolean(data.voice);
  delete data.cartoonImageUpload;
  els.cartoonStatus.textContent = `Creating ${data.days} cartoon video${data.days === 1 ? '' : 's'}${data.voice ? ' with voiceover' : ''}...`;
  try {
    data.uploadedImagePath = await ensureUploadedCartoonImage();
    const result = await api('/api/youtube-cartoon', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    els.cartoonStatus.textContent = `${result.count} cartoon video${result.count === 1 ? '' : 's'} created.`;
    els.cartoonPreview.className = 'cartoon-result';
    const items = result.results || [result];
    els.cartoonPreview.innerHTML = `
      ${items.map((item) => `
        <article class="cartoon-day-card">
          <div class="cartoon-video-frame">
            <iframe src="${item.playerPath || item.videoPath}" title="Day ${item.dayNumber} cartoon video preview"></iframe>
          </div>
          <div class="cartoon-day-copy">
            <p class="eyebrow">Day ${item.dayNumber}</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <p class="meta">Duration: ${escapeHtml(String(item.duration))} seconds${item.audioPath ? ' with voiceover' : ''}</p>
            ${item.voiceError ? `<p class="meta">Voiceover skipped: ${escapeHtml(item.voiceError)}</p>` : ''}
            <div class="cartoon-actions">
              <a class="ghost-button link-button" href="${item.playerPath || item.videoPath}" target="_blank">Open Video Player</a>
              <a class="ghost-button link-button" href="${item.videoPath}" download="youtube-cartoon-day-${item.dayNumber}.svg">Download Animation</a>
              ${item.audioPath ? `<a class="ghost-button link-button" href="${item.audioPath}" download="youtube-cartoon-day-${item.dayNumber}-voice.mp3">Download Voice</a>` : ''}
            </div>
            <div class="storyboard-list">
              ${item.scenes.map((scene, index) => `
                <article>
                  <strong>Scene ${index + 1}: ${escapeHtml(scene.onScreenText)}</strong>
                  <p>${escapeHtml(scene.narration)}</p>
                  <p class="meta">${escapeHtml(scene.visual)}</p>
                </article>
              `).join('')}
            </div>
          </div>
        </article>
      `).join('')}
    `;
  } catch (error) {
    els.cartoonStatus.textContent = error.message;
  }
});

async function ensureUploadedCartoonImage() {
  const file = els.cartoonImageUpload.files?.[0];
  if (file) {
    els.cartoonStatus.textContent = 'Uploading cartoon image...';
    const imageData = await readFileAsDataUrl(file);
    state.uploadedCartoonImage = await api('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ imageData, filename: file.name })
    });
    return state.uploadedCartoonImage.publicPath;
  }
  return state.uploadedCartoonImage?.publicPath || null;
}

els.clearReferencePost.addEventListener('click', () => {
  els.form.querySelector('[name="referencePost"]').value = '';
  els.referencePostUpload.value = '';
  state.uploadedReferencePost = null;
  els.referencePostPreview.innerHTML = '<span>No reference post uploaded</span>';
  els.status.textContent = 'Reference post cleared.';
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
      const displayStatus = post.status === 'published-demo' ? 'published' : post.status;
      chip.className = `post-chip ${displayStatus}`;
      chip.textContent = `${formatTime(post.scheduledAt)} · ${post.category} - ${displayStatus}`;
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
  const statusStr = post.status === 'published-demo' ? 'published' : post.status;
  els.selected.className = 'selected-card';
  els.selected.innerHTML = `
    <img src="${post.imagePath}" alt="Generated quote card">
    <div>
      <p class="meta">${formatDate(post.scheduledAt, true)} - ${escapeHtml(statusStr)}</p>
      <h3 class="quote">${escapeHtml(post.quote)}</h3>
      <p>${escapeHtml(post.caption)}</p>
      <p class="meta">${escapeHtml(post.creatorName || 'Rini')} - ${escapeHtml(handle)}</p>
      ${post.sourceFileName ? `<p class="meta">Source file: ${escapeHtml(post.sourceFileName)}</p>` : ''}
      ${post.referencePost || post.referencePostImagePath ? `<p class="meta">Reference post: used for similar style</p>` : ''}
      ${post.referencePostImagePath ? `<img class="reference-thumb" src="${post.referencePostImagePath}" alt="Reference post image">` : ''}
      <p class="meta">${post.hashtags.map(escapeHtml).join(' ')}</p>
      ${post.videoUrl ? `<p class="meta">Video: <a href="${post.videoUrl}" target="_blank">open</a></p>` : ''}
      ${post.grokImageUrl ? `<p class="meta">Grok image: <a href="${post.grokImageUrl}" target="_blank">open</a></p>` : ''}
      ${post.error ? `<p class="meta">Error: ${escapeHtml(post.error)}</p>` : ''}
      ${renderAgentReview(post)}
      <div class="actions">
        <a class="ghost-button link-button" href="${post.imagePath}" download="instagram-post-${post.scheduledAt.slice(0, 10)}.svg">Download Post</a>
        <button class="ghost-button" data-action="regenerate">Regenerate</button>
        <button class="ghost-button" data-action="regenerate-hashtags">Regenerate Hashtags</button>
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

function formatTime(value) {
  const date = new Date(value);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderPostTimeInputs() {
  const count = clampInteger(els.postsPerDayInput.value, 1, 10, 1);
  els.postsPerDayInput.value = String(count);

  const existingTimes = [...els.postTimesContainer.querySelectorAll('input[name="postTimes"]')]
    .map((input) => input.value);
  const defaults = getDefaultPostTimes(count);

  els.postTimesContainer.innerHTML = '';
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement('label');
    label.className = 'post-time-field';
    label.innerHTML = `
      Post ${index + 1} Time
      <input name="postTimes" type="time" value="${existingTimes[index] || defaults[index]}" required />
    `;
    els.postTimesContainer.appendChild(label);
  }
}

function updateScheduleSummary() {
  const days = clampInteger(els.daysInput.value, 1, 50, 1);
  const postsPerDay = clampInteger(els.postsPerDayInput.value, 1, 10, 1);
  const total = days * postsPerDay;
  els.scheduleSummary.textContent = `${days} day${days === 1 ? '' : 's'} × ${postsPerDay} post${postsPerDay === 1 ? '' : 's'} per day = ${total} total post${total === 1 ? '' : 's'}`;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getDefaultPostTimes(count) {
  const presets = {
    1: ['09:00'],
    2: ['09:00', '18:00'],
    3: ['09:00', '14:00', '19:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
    5: ['08:00', '11:00', '14:00', '17:00', '20:00']
  };
  if (presets[count]) return presets[count];

  const startMinutes = 8 * 60;
  const endMinutes = 22 * 60;
  const step = (endMinutes - startMinutes) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => {
    const totalMinutes = Math.round((startMinutes + step * index) / 5) * 5;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

// Load Instagram status and bind connection test
async function loadInstagramStatus() {
  try {
    const status = await api('/api/integrations/instagram/status');
    const textEl = document.querySelector('#instagramStatusText');
    if (status.status === 'connected') {
      if (status.mode === 'demo') {
        textEl.innerHTML = `Instagram: Demo Connection<br>Publishing: Simulated`;
      } else {
        textEl.innerHTML = `Connected: @${escapeHtml(status.username)}`;
      }
    } else {
      textEl.innerHTML = `Disconnected<br>${escapeHtml(status.error || '')}`;
    }
  } catch (error) {
    document.querySelector('#instagramStatusText').textContent = 'Error checking connection';
  }
}

document.querySelector('#testInstagramConnection').addEventListener('click', async () => {
  const btn = document.querySelector('#testInstagramConnection');
  btn.disabled = true;
  const textEl = document.querySelector('#instagramStatusText');
  textEl.textContent = 'Testing connection...';
  await loadInstagramStatus();
  btn.disabled = false;
});

// Bind Suggest Creative Direction button
document.querySelector('#suggestCreativeBtn').addEventListener('click', async () => {
  const form = document.querySelector('#planForm');
  const category = form.querySelector('[name="category"]').value;
  const tone = form.querySelector('[name="tone"]').value;
  const statusEl = document.querySelector('#formStatus');
  statusEl.textContent = 'Suggesting creative direction...';
  try {
    const res = await api('/api/suggest-creative-direction', {
      method: 'POST',
      body: JSON.stringify({ category, tone })
    });
    form.querySelector('[name="creativePrompt"]').value = res.suggestion;
    statusEl.textContent = 'Creative direction suggested!';
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

loadPosts();
loadInstagramStatus();
