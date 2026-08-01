import { getPosts, savePosts } from './store.js';
import { animateWithGrok } from './services/xai.js';
import { publishToInstagram } from './services/instagram.js';
import { useDemoPublishing } from './runtimeMode.js';

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    runDuePostsNow().catch((error) => console.error(error));
  }, 60_000);
}

export async function runDuePostsNow() {
  const posts = getPosts();
  const now = new Date();
  const due = posts.filter((post) => post.status === 'scheduled' && new Date(post.scheduledAt) <= now);
  const results = [];

  for (const post of due) {
    try {
      post.status = 'publishing';
      post.updatedAt = new Date().toISOString();
      savePosts(posts);

      if (post.animationRequested && !post.videoUrl) {
        const video = await animateWithGrok(post);
        post.videoUrl = video.url;
      }

      const published = await publishToInstagram(post);
      const simulated = published.demo === true || useDemoPublishing();
      post.status = 'published';
      post.publishingMode = simulated ? 'demo' : 'live';
      post.instagramMediaId = published.mediaId;
      post.error = null;
      results.push({ id: post.id, status: post.status });
    } catch (error) {
      post.status = 'failed';
      post.error = error.message;
      results.push({ id: post.id, status: 'failed', error: error.message });
    } finally {
      post.updatedAt = new Date().toISOString();
      savePosts(posts);
    }
  }

  return { checkedAt: new Date().toISOString(), processed: results };
}
