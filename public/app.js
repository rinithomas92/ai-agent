const state = {
  posts: [],
  selectedId: null,
  uploadedImage: null,
  uploadedReferencePost: null,
  uploadedSourceFile: null,
  uploadedCartoonImage: null,
  selectedPreviewDate: null
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

// Content Template cards are radio inputs named "templateId" inside #planForm,
// so the selected ID is sent with Generate Schedule automatically.
const DEFAULT_TEMPLATE_ID = 'premium_quote_dark';

function templateRadios() {
  return [...els.form.querySelectorAll('input[name="templateId"]')];
}

function normalizeTemplateId(templateId) {
  return templateRadios().some((radio) => radio.value === templateId) ? templateId : DEFAULT_TEMPLATE_ID;
}

function getSelectedTemplateId() {
  return templateRadios().find((radio) => radio.checked)?.value || DEFAULT_TEMPLATE_ID;
}

function setSelectedTemplateId(templateId) {
  const id = normalizeTemplateId(templateId);
  templateRadios().forEach((radio) => { radio.checked = radio.value === id; });
}

function templateName(templateId) {
  const radio = templateRadios().find((item) => item.value === normalizeTemplateId(templateId));
  return radio?.closest('.template-card').querySelector('.template-card-name').textContent.trim() || templateId;
}

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

    // Link the schedule to the saved prompt loaded into the form (traceability only).
    const savedPrompt = loadedSavedPrompt();
    if (savedPrompt) {
      data.savedPromptId = savedPrompt.id;
      data.savedPromptName = savedPrompt.name;
    }

    const totalPosts = data.days * data.postsPerDay;
    els.status.textContent = `Agent is creating ${totalPosts} post${totalPosts === 1 ? '' : 's'}${data.sourceFileId ? ' from your source file' : ''}...`;
    const created = await api('/api/plan', { method: 'POST', body: JSON.stringify(data) });
    els.status.textContent = `${created.length} post${created.length === 1 ? '' : 's'} scheduled successfully${savedPrompt ? ` using saved prompt: ${savedPrompt.name}` : ''}.`;
    if (created && created.length > 0) {
      localStorage.setItem('currentCampaignId', created[0].campaignId);
      state.selectedId = created[0].id;
    }
    await loadPosts();
    if (savedPrompt) await loadPrompts(); // show the updated "Last used" date
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
  const confirmed = window.confirm('Clear all scheduled posts? Saved prompts in the Prompt Library are kept. This cannot be undone.');
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
  let post = state.posts.find((item) => item.id === state.selectedId);
  if (!post) {
    const currentCampaignId = localStorage.getItem('currentCampaignId');
    if (currentCampaignId) {
      post = state.posts.find((item) => item.campaignId === currentCampaignId);
    }
  }
  if (!post) {
    post = state.posts[0];
  }

  if (!post) {
    els.selected.className = 'empty-state';
    els.selected.textContent = 'Choose a post from the calendar.';
    renderCampaignPreviews();
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
      <p class="meta">Content engine: ${post.generationMode === 'live' ? 'OpenAI Live' : 'Demo / fallback'}${post.regenerationCount ? ` · Regenerated ${post.regenerationCount} time${post.regenerationCount === 1 ? '' : 's'}` : ''}</p>
      <p class="meta">Content Template: ${escapeHtml(templateName(post.templateId))}</p>
      ${post.savedPromptName ? `<p class="meta">Saved prompt: ${escapeHtml(post.savedPromptName)}</p>` : ''}
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
      const originalLabel = button.textContent;
      if (action === 'regenerate') button.textContent = 'Regenerating Post...';
      if (action === 'regenerate-hashtags') button.textContent = 'Regenerating Hashtags...';
      try {
        await api(`/api/posts/${post.id}/${action}`, { method: 'POST' });
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = originalLabel;
      }
      await loadPosts();
    });
  });
  renderCampaignPreviews();
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


function renderCampaignPreviews() {
  const container = document.querySelector('#campaignPreviewsSection');
  const selectorEl = document.querySelector('#campaignPreviewDaySelector');
  const listEl = document.querySelector('#campaignPreviewsList');
  if (!container || !selectorEl || !listEl) return;

  // Preview every saved post date, including posts from older campaigns.
  const previewPosts = state.posts
    .filter((post) => typeof post.scheduledAt === 'string' && post.scheduledAt.length >= 10)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  if (previewPosts.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const postsByDate = new Map();
  for (const post of previewPosts) {
    const dateKey = post.scheduledAt.slice(0, 10);
    if (!postsByDate.has(dateKey)) postsByDate.set(dateKey, []);
    postsByDate.get(dateKey).push(post);
  }

  // Show all dates that exist in saved post history. Newer dates appear first.
  const previewDates = [...postsByDate.keys()].sort((a, b) => b.localeCompare(a));

  // If a post is currently selected (from any campaign), keep its date selected.
  const selectedPost = previewPosts.find((post) => post.id === state.selectedId);
  if (selectedPost) {
    state.selectedPreviewDate = selectedPost.scheduledAt.slice(0, 10);
  }

  if (!state.selectedPreviewDate || !postsByDate.has(state.selectedPreviewDate)) {
    const currentCampaignId = localStorage.getItem('currentCampaignId');
    const currentCampaignPost = currentCampaignId
      ? previewPosts.find((post) => post.campaignId === currentCampaignId)
      : null;
    state.selectedPreviewDate = currentCampaignPost
      ? currentCampaignPost.scheduledAt.slice(0, 10)
      : previewDates[0];
  }

  selectorEl.innerHTML = `
    <label for="campaignPreviewDateSelect">Preview date</label>
    <select id="campaignPreviewDateSelect" class="campaign-preview-date-select">
      ${previewDates.map((dateKey) => {
        const firstPost = postsByDate.get(dateKey)[0];
        const selected = dateKey === state.selectedPreviewDate ? ' selected' : '';
        const postCount = postsByDate.get(dateKey).length;
        return `<option value="${dateKey}"${selected}>${escapeHtml(formatPreviewDate(firstPost.scheduledAt))} (${postCount} post${postCount === 1 ? '' : 's'})</option>`;
      }).join('')}
    </select>
  `;

  selectorEl.querySelector('#campaignPreviewDateSelect').addEventListener('change', (event) => {
    state.selectedPreviewDate = event.target.value;
    const firstPostForDate = postsByDate.get(state.selectedPreviewDate)?.[0];
    if (firstPostForDate) {
      state.selectedId = firstPostForDate.id;
      renderSelected();
    } else {
      renderCampaignPreviews();
    }
  });

  listEl.innerHTML = '';
  const visiblePosts = postsByDate.get(state.selectedPreviewDate) || [];

  const selectedDateHeader = document.createElement('div');
  selectedDateHeader.className = 'campaign-date-header';
  selectedDateHeader.textContent = visiblePosts.length
    ? formatPreviewDate(visiblePosts[0].scheduledAt)
    : state.selectedPreviewDate;
  listEl.appendChild(selectedDateHeader);

  const postsContainer = document.createElement('div');
  postsContainer.className = 'campaign-day-posts';

  for (const post of visiblePosts) {
    const card = document.createElement('div');
    card.className = 'campaign-post-card';
    if (post.id === state.selectedId) card.classList.add('active');

    const postTimeStr = post.postTime || formatTime(post.scheduledAt);
    const displayStatus = post.status === 'published-demo' ? 'published' : post.status;
    card.innerHTML = `
      <img class="campaign-post-thumb" src="${post.imagePath}" alt="Post thumbnail">
      <div class="campaign-post-details">
        <span class="campaign-post-meta">${escapeHtml(formatPreviewDate(post.scheduledAt))} · ${escapeHtml(postTimeStr)}${displayStatus ? ` · ${escapeHtml(displayStatus)}` : ''}</span>
        <span class="campaign-post-hook">${escapeHtml(post.quote)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      state.selectedId = post.id;
      state.selectedPreviewDate = post.scheduledAt.slice(0, 10);
      renderSelected();
    });

    postsContainer.appendChild(card);
  }

  listEl.appendChild(postsContainer);
}

function formatPreviewDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
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

// Prompt Library: saved prompts are stored separately from posts, so they
// survive Clear Schedule and Replace Existing Schedule.
const promptLibrary = {
  prompts: [],
  select: document.querySelector('#promptLibrarySelect'),
  selectField: document.querySelector('#promptLibrarySelectField'),
  empty: document.querySelector('#promptLibraryEmpty'),
  nameInput: document.querySelector('#promptNameInput'),
  saveBtn: document.querySelector('#savePromptBtn'),
  updateBtn: document.querySelector('#updatePromptBtn'),
  deleteBtn: document.querySelector('#deletePromptBtn'),
  status: document.querySelector('#promptLibraryStatus'),
  details: document.querySelector('#promptDetails'),
  detailsName: document.querySelector('#promptDetailsName'),
  detailsList: document.querySelector('#promptDetailsList'),
  loadedBadge: document.querySelector('#promptLoadedBadge'),
  loadBtn: document.querySelector('#loadPromptBtn'),
  scheduleAgainBtn: document.querySelector('#scheduleAgainBtn'),
  // The saved prompt currently loaded into the planning form. Generate Schedule
  // sends it along so posts record their source and the prompt's lastUsedAt updates.
  loadedId: null
};

function loadedSavedPrompt() {
  return promptLibrary.prompts.find((prompt) => prompt.id === promptLibrary.loadedId) || null;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderPromptDetails() {
  const prompt = selectedSavedPrompt();
  promptLibrary.details.hidden = !prompt;
  if (!prompt) return;
  const isLoaded = promptLibrary.loadedId === prompt.id;
  promptLibrary.details.classList.toggle('loaded', isLoaded);
  promptLibrary.loadedBadge.hidden = !isLoaded;
  promptLibrary.detailsName.textContent = prompt.name;
  const rows = [
    ['Prompt', prompt.promptText, 'prompt-details-text'],
    ['Category', prompt.category || '—'],
    ['Creative direction', prompt.creativeDirection || '—'],
    ['Template', templateName(prompt.defaultTemplate)],
    ['Last used', prompt.lastUsedAt ? formatDateTime(prompt.lastUsedAt) : 'Not used for a schedule yet']
  ];
  promptLibrary.detailsList.innerHTML = rows.map(([label, value, className]) => `
    <dt>${escapeHtml(label)}</dt><dd${className ? ` class="${className}" title="${escapeHtml(value)}"` : ''}>${escapeHtml(value)}</dd>
  `).join('');
}

function loadSavedPrompt(prompt) {
  applySavedPrompt(prompt);
  promptLibrary.loadedId = prompt.id;
  promptLibrary.status.textContent = `Loaded from Prompt Library: ${prompt.name}`;
  renderPromptDetails();
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Suggested start for a new campaign: today, or the day after the last scheduled
// post if a schedule already runs into the future. The user can change it.
function suggestedStartDate() {
  const today = localDateString(new Date());
  const latest = state.posts.map((post) => String(post.scheduledAt || '').slice(0, 10)).filter(Boolean).sort().pop();
  if (!latest || latest < today) return today;
  const [year, month, day] = latest.split('-').map(Number);
  return localDateString(new Date(year, month - 1, day + 1));
}

function flashField(element) {
  element.classList.remove('field-flash');
  void element.offsetWidth; // restart the animation
  element.classList.add('field-flash');
}

function promptFormField(name) {
  return els.form.querySelector(`[name="${name}"]`);
}

function collectPromptFields() {
  return {
    name: promptLibrary.nameInput.value.trim(),
    promptText: promptFormField('openAiPrompt').value,
    category: promptFormField('category').value,
    creativeDirection: promptFormField('creativePrompt').value,
    defaultTemplate: getSelectedTemplateId()
  };
}

function applySavedPrompt(prompt) {
  promptFormField('openAiPrompt').value = prompt.promptText || '';
  if (prompt.category) promptFormField('category').value = prompt.category;
  promptFormField('creativePrompt').value = prompt.creativeDirection || '';
  setSelectedTemplateId(prompt.defaultTemplate);
  promptLibrary.nameInput.value = prompt.name;
}

function selectedSavedPrompt() {
  return promptLibrary.prompts.find((prompt) => prompt.id === promptLibrary.select.value) || null;
}

function syncPromptButtons() {
  const hasSelection = Boolean(selectedSavedPrompt());
  promptLibrary.updateBtn.disabled = !hasSelection;
  promptLibrary.deleteBtn.disabled = !hasSelection;
}

function renderPromptLibrary(selectedId = '') {
  const { prompts, select, selectField, empty } = promptLibrary;
  selectField.style.display = prompts.length ? '' : 'none';
  if (!prompts.length) {
    select.innerHTML = '<option value="">No saved prompts yet.</option>';
    select.disabled = true;
    empty.style.display = 'block';
  } else {
    select.innerHTML = `
      <option value="">Select a saved prompt...</option>
      ${prompts.map((prompt) => `<option value="${escapeHtml(prompt.id)}">${escapeHtml(prompt.name)}</option>`).join('')}
    `;
    select.disabled = false;
    select.value = prompts.some((prompt) => prompt.id === selectedId) ? selectedId : '';
    empty.style.display = 'none';
  }
  if (!loadedSavedPrompt()) promptLibrary.loadedId = null;
  syncPromptButtons();
  renderPromptDetails();
}

async function loadPrompts(selectedId = promptLibrary.select.value) {
  try {
    promptLibrary.prompts = await api('/api/prompts');
  } catch (error) {
    promptLibrary.prompts = [];
    promptLibrary.status.textContent = `Could not load saved prompts: ${error.message}`;
  }
  renderPromptLibrary(selectedId);
}

// Choosing a prompt in the dropdown loads it into the form (as before). It no
// longer marks the prompt as used; that now happens when a schedule is generated.
promptLibrary.select.addEventListener('change', () => {
  const prompt = selectedSavedPrompt();
  syncPromptButtons();
  if (!prompt) {
    promptLibrary.loadedId = null;
    promptLibrary.status.textContent = '';
    renderPromptDetails();
    return;
  }
  loadSavedPrompt(prompt);
});

promptLibrary.loadBtn.addEventListener('click', () => {
  const prompt = selectedSavedPrompt();
  if (prompt) loadSavedPrompt(prompt);
});

// Schedule Again prepares a new campaign from the saved prompt. It does not create
// posts: the user reviews the dates/times/template and clicks Generate Schedule.
promptLibrary.scheduleAgainBtn.addEventListener('click', () => {
  const prompt = selectedSavedPrompt();
  if (!prompt) return;
  loadSavedPrompt(prompt);
  els.daysInput.value = '30';
  updateScheduleSummary();
  const startDate = els.form.querySelector('[name="startDate"]');
  startDate.value = suggestedStartDate();
  els.status.textContent = `Ready to schedule again with "${prompt.name}": 30 days from ${startDate.value}. Check the start date, posting times and template, then click Generate Schedule.`;
  [els.daysInput, startDate, els.postTimesContainer].forEach(flashField);
  els.daysInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  startDate.focus({ preventScroll: true });
});

promptLibrary.saveBtn.addEventListener('click', async () => {
  const fields = collectPromptFields();
  if (!fields.name) {
    promptLibrary.status.textContent = 'Enter a prompt name before saving.';
    promptLibrary.nameInput.focus();
    return;
  }
  promptLibrary.saveBtn.disabled = true;
  try {
    const created = await api('/api/prompts', { method: 'POST', body: JSON.stringify(fields) });
    promptLibrary.loadedId = created.id; // the form now holds exactly this prompt
    await loadPrompts(created.id);
    promptLibrary.status.textContent = `Saved "${created.name}".`;
  } catch (error) {
    promptLibrary.status.textContent = error.message;
  } finally {
    promptLibrary.saveBtn.disabled = false;
  }
});

promptLibrary.updateBtn.addEventListener('click', async () => {
  const prompt = selectedSavedPrompt();
  if (!prompt) return;
  const fields = collectPromptFields();
  if (!fields.name) fields.name = prompt.name;
  promptLibrary.updateBtn.disabled = true;
  try {
    const updated = await api(`/api/prompts/${prompt.id}`, { method: 'PUT', body: JSON.stringify(fields) });
    promptLibrary.loadedId = updated.id;
    await loadPrompts(updated.id);
    promptLibrary.status.textContent = `Updated "${updated.name}".`;
  } catch (error) {
    promptLibrary.status.textContent = error.message;
    syncPromptButtons();
  }
});

promptLibrary.deleteBtn.addEventListener('click', async () => {
  const prompt = selectedSavedPrompt();
  if (!prompt) return;
  if (!window.confirm(`Delete saved prompt "${prompt.name}"? This does not affect scheduled posts.`)) return;
  try {
    await api(`/api/prompts/${prompt.id}`, { method: 'DELETE' });
    promptLibrary.nameInput.value = '';
    await loadPrompts('');
    promptLibrary.status.textContent = `Deleted "${prompt.name}".`;
  } catch (error) {
    promptLibrary.status.textContent = error.message;
  }
});

loadPosts();
loadInstagramStatus();
loadPrompts();
