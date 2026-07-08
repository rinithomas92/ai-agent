import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { z } from 'zod';
import { getPosts, savePosts, getSettings, saveSettings } from './store.js';
import { generateContentPack } from './services/openai.js';
import { createAgentStrategy, getDailyMission, reviewContent } from './services/agent.js';
import { createQuoteCard } from './services/renderCard.js';
import { generateGrokImage, animateWithGrok } from './services/xai.js';
import { publishToInstagram } from './services/instagram.js';
import { startScheduler, runDuePostsNow } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use('/generated', express.static(path.join(root, 'public', 'generated')));
app.use('/uploads', express.static(path.join(root, 'public', 'uploads')));
app.use(express.static(path.join(root, 'public')));

const planSchema = z.object({
  category: z.string().min(2),
  days: z.coerce.number().int().min(1).max(365),
  startDate: z.string().min(10),
  postTime: z.string().regex(/^\d{2}:\d{2}$/),
  tone: z.string().min(2).default('inspirational'),
  agentMode: z.boolean().default(true),
  agentGoal: z.string().max(1500).optional().default(''),
  creativePrompt: z.string().max(3000).optional().default(''),
  quoteDescription: z.string().max(1000).optional().default(''),
  backgroundDescription: z.string().max(1000).optional().default(''),
  animation: z.boolean().default(false),
  creatorName: z.string().min(1).default('Rini'),
  instagramHandle: z.string().min(2).default('@getholisticallyfitwithrini'),
  uploadedImagePath: z.string().optional().nullable()
});

const uploadSchema = z.object({
  imageData: z.string().startsWith('data:image/'),
  filename: z.string().min(1).max(180)
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, schedulerTimezone: process.env.SCHEDULER_TIMEZONE || 'Asia/Kolkata' });
});

app.get('/api/settings', (_req, res) => {
  res.json(getSettings());
});

app.put('/api/settings', (req, res) => {
  const current = getSettings();
  const next = { ...current, ...req.body };
  saveSettings(next);
  res.json(next);
});

app.get('/api/posts', (_req, res) => {
  res.json(getPosts().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
});

app.post('/api/uploads', async (req, res, next) => {
  try {
    const input = uploadSchema.parse(req.body);
    const match = input.imageData.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Upload must be a PNG, JPG, or WEBP image.' });

    const extByMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
    const ext = extByMime[match[1]];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 12 * 1024 * 1024) return res.status(400).json({ error: 'Image must be 12MB or smaller.' });

    const uploadDir = path.join(root, 'public', 'uploads');
    await fsp.mkdir(uploadDir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fsp.writeFile(path.join(uploadDir, filename), buffer);
    const publicPath = `/uploads/${filename}`;
    res.status(201).json({
      publicPath,
      publicUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`,
      originalName: input.filename
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/plan', async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const posts = getPosts();
    const created = [];
    const agentStrategy = await createAgentStrategy(input);

    for (let day = 0; day < input.days; day += 1) {
      const yyyyMmDd = addDaysToDateString(input.startDate, day);
      const scheduledAt = `${yyyyMmDd}T${input.postTime}:00`;
      const dailyMission = getDailyMission(agentStrategy, day, input);
      const content = await generateContentPack({
        category: input.category,
        tone: input.tone,
        agentMode: input.agentMode,
        agentGoal: input.agentGoal,
        agentStrategy,
        dailyMission,
        creativePrompt: input.creativePrompt,
        quoteDescription: input.quoteDescription,
        day: day + 1,
        totalDays: input.days
      });
      const brand = {
        creatorName: input.creatorName,
        instagramHandle: input.instagramHandle,
        uploadedImagePath: input.uploadedImagePath,
        backgroundDescription: input.backgroundDescription
      };
      const styleVariant = day % 3;
      const card = await createQuoteCard(content, { category: input.category, styleVariant, ...brand });
      const agentReview = reviewContent(content, input, agentStrategy, dailyMission);
      const post = {
        id: randomUUID(),
        category: input.category,
        tone: input.tone,
        agentMode: input.agentMode,
        agentGoal: input.agentGoal,
        agentStrategy,
        agentMission: dailyMission,
        agentQualityScore: agentReview.score,
        agentRationale: agentReview.rationale,
        creativePrompt: input.creativePrompt,
        quoteDescription: input.quoteDescription,
        backgroundDescription: input.backgroundDescription,
        creatorName: input.creatorName,
        instagramHandle: input.instagramHandle,
        uploadedImagePath: input.uploadedImagePath,
        styleVariant,
        scheduledAt,
        status: 'scheduled',
        animationRequested: input.animation,
        quote: content.quote,
        caption: content.caption,
        hashtags: content.hashtags,
        imagePath: card.publicPath,
        imageUrl: card.publicUrl,
        grokImageUrl: null,
        videoUrl: null,
        instagramMediaId: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      posts.push(post);
      created.push(post);
    }

    savePosts(posts);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/regenerate', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const content = await generateContentPack({
      category: post.category,
      tone: post.tone,
      agentMode: post.agentMode || false,
      agentGoal: post.agentGoal || '',
      agentStrategy: post.agentStrategy || null,
      dailyMission: post.agentMission || '',
      creativePrompt: post.creativePrompt || '',
      quoteDescription: post.quoteDescription || '',
      day: 1,
      totalDays: 1
    });
    const card = await createQuoteCard(content, {
      category: post.category,
      creatorName: post.creatorName || 'Rini',
      instagramHandle: post.instagramHandle || '@getholisticallyfitwithrini',
      uploadedImagePath: post.uploadedImagePath,
      backgroundDescription: post.backgroundDescription || '',
      styleVariant: post.styleVariant || 0
    });
    const agentReview = reviewContent(content, {
      category: post.category,
      tone: post.tone,
      instagramHandle: post.instagramHandle || '@getholisticallyfitwithrini'
    }, post.agentStrategy || null, post.agentMission || '');
    Object.assign(post, {
      quote: content.quote,
      caption: content.caption,
      hashtags: content.hashtags,
      agentQualityScore: agentReview.score,
      agentRationale: agentReview.rationale,
      imagePath: card.publicPath,
      imageUrl: card.publicUrl,
      status: post.status === 'failed' ? 'scheduled' : post.status,
      error: null,
      updatedAt: new Date().toISOString()
    });
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/grok-image', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const grokImage = await generateGrokImage(post);
    post.grokImageUrl = grokImage.url;
    post.updatedAt = new Date().toISOString();
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/animate', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const video = await animateWithGrok(post);
    post.videoUrl = video.url;
    post.updatedAt = new Date().toISOString();
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/publish', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const result = await publishToInstagram(post);
    post.status = 'published';
    post.instagramMediaId = result.mediaId;
    post.error = null;
    post.updatedAt = new Date().toISOString();
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post('/api/run-due', async (_req, res, next) => {
  try {
    const result = await runDuePostsNow();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:id', (req, res) => {
  const posts = getPosts();
  const nextPosts = posts.filter((post) => post.id !== req.params.id);
  savePosts(nextPosts);
  res.status(204).end();
});

app.get('/api/download-all', async (_req, res, next) => {
  try {
    const posts = getPosts();
    res.attachment('instagram-posts.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', next);
    archive.pipe(res);

    for (const [index, post] of posts.entries()) {
      const generatedPath = publicPathToFile(post.imagePath);
      if (generatedPath && fs.existsSync(generatedPath)) {
        const date = post.scheduledAt.slice(0, 10);
        archive.file(generatedPath, { name: `${String(index + 1).padStart(2, '0')}-${date}-${slug(post.category)}.svg` });
      }
      archive.append(`${post.caption}\n\n${post.hashtags.join(' ')}\n`, {
        name: `${String(index + 1).padStart(2, '0')}-${post.scheduledAt.slice(0, 10)}-caption.txt`
      });
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.name === 'ZodError' ? 400 : 500;
  res.status(status).json({ error: error.message, details: error.errors });
});

startScheduler();

app.listen(port, host, () => {
  console.log(`AI Instagram Scheduler running on ${host}:${port}`);
});

function addDaysToDateString(yyyyMmDd, days) {
  const [year, month, date] = yyyyMmDd.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + days));
  return value.toISOString().slice(0, 10);
}

function publicPathToFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/')) return null;
  return path.join(root, 'public', publicPath.replace(/^\//, ''));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'post';
}
