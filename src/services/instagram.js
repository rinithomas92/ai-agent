const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0';

export async function publishToInstagram(post) {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_IG_USER_ID;
  if (!accessToken || !igUserId) {
    throw new Error('Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_USER_ID');
  }

  const mediaUrl = post.videoUrl || post.grokImageUrl || post.imageUrl;
  if (!mediaUrl || mediaUrl.includes('localhost')) {
    throw new Error('Instagram requires a publicly reachable image_url or video_url. Update PUBLIC_BASE_URL or use Grok media.');
  }

  const caption = `${post.caption}\n\n${post.hashtags.join(' ')}`;
  const container = await graphPost(`${igUserId}/media`, {
    caption,
    ...(post.videoUrl ? { media_type: 'REELS', video_url: mediaUrl } : { image_url: mediaUrl })
  });

  await waitForContainer(container.id);
  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: container.id
  });

  return { mediaId: published.id };
}

async function graphPost(path, params) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  url.searchParams.set('access_token', process.env.INSTAGRAM_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Instagram request failed: ${response.status}`);
  return data;
}

async function graphGet(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  url.searchParams.set('access_token', process.env.INSTAGRAM_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Instagram request failed: ${response.status}`);
  return data;
}

async function waitForContainer(containerId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const data = await graphGet(containerId, { fields: 'status_code' });
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Instagram media container failed processing');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Instagram media container did not finish in time');
}
