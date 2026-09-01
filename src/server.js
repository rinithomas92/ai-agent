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
import { createPhotoQuoteCard, createQuoteCard } from './services/renderCard.js';
import { generateOpenAIBackgroundImage } from './services/openaiImage.js';
import { createCartoonVideo, generateCartoonStoryboard, generateCartoonVoiceover } from './services/cartoonVideo.js';
import { generateGrokImage, animateWithGrok } from './services/xai.js';
import { publishToInstagram, validateCredentials } from './services/instagram.js';
import { startScheduler, runDuePostsNow } from './scheduler.js';
import { getRuntimeModes, useDemoContent, useDemoImages, useDemoPublishing } from './runtimeMode.js';
import { getSourceFile, saveSourceFileUpload, sourceContextForPrompt } from './services/sourceFiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || '0.0.0.0';
const configuredMaxPostsPerDay = Number(process.env.MAX_POSTS_PER_DAY || 10);
const maxPostsPerDay = Number.isInteger(configuredMaxPostsPerDay) && configuredMaxPostsPerDay > 0
  ? configuredMaxPostsPerDay
  : 10;

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use('/generated', express.static(path.join(root, 'public', 'generated')));
app.use('/uploads', express.static(path.join(root, 'public', 'uploads')));
app.use(express.static(path.join(root, 'public')));

const planSchema = z.object({
  category: z.string().min(2),
  days: z.coerce.number().int().min(1).max(50),
  postsPerDay: z.coerce.number().int().min(1).max(maxPostsPerDay).default(1),
  startDate: z.string().min(10),
  postTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('09:00'),
  postTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(maxPostsPerDay).optional().default([]),
  tone: z.string().min(2).default('inspirational'),
  theme: z.string().min(2).default('minimalLight'),
  agentMode: z.boolean().default(true),
  agentGoal: z.string().max(1500).optional().default(''),
  creativePrompt: z.string().max(3000).optional().default(''),
  openAiPrompt: z.string().max(3000).optional().default(''),
  referencePost: z.string().max(3000).optional().default(''),
  referencePostImagePath: z.string().optional().nullable(),
  replaceExistingSchedule: z.boolean().default(false),
  quoteDescription: z.string().max(1000).optional().default(''),
  backgroundDescription: z.string().max(1000).optional().default(''),
  sourceFileId: z.string().uuid().optional().nullable(),
  animation: z.boolean().default(false),
  creatorName: z.string().min(1).default('Rini'),
  instagramHandle: z.string().min(2).default('@getholisticallyfitwithrini'),
  uploadedImagePath: z.string().optional().nullable()
});

const uploadSchema = z.object({
  imageData: z.string().startsWith('data:image/'),
  filename: z.string().min(1).max(180)
});

const sourceFileUploadSchema = z.object({
  fileData: z.string().startsWith('data:'),
  filename: z.string().min(1).max(180)
});

const promptImageSchema = z.object({
  prompt: z.string().min(2).max(3000),
  count: z.coerce.number().int().min(1).max(10).default(1),
  category: z.string().min(2).default('Daily Quote'),
  tone: z.string().min(2).default('Inspirational'),
  theme: z.string().min(2).default('minimalDark'),
  creatorName: z.string().min(1).default('Rini'),
  instagramHandle: z.string().min(2).default('@getholisticallyfitwithrini'),
  uploadedImagePath: z.string().optional().nullable()
});

const cartoonVideoSchema = z.object({
  theme: z.string().min(2).max(300),
  audience: z.string().min(2).max(120).default('kids and families'),
  duration: z.coerce.number().int().min(15).max(120).default(30),
  style: z.string().min(2).max(120).default('colorful 2D cartoon'),
  days: z.coerce.number().int().min(1).max(30).default(1),
  voice: z.boolean().default(true),
  prompt: z.string().max(2000).optional().default(''),
  uploadedImagePath: z.string().optional().nullable()
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    schedulerTimezone: process.env.SCHEDULER_TIMEZONE || 'Asia/Kolkata',
    runtime: getRuntimeModes()
  });
});

app.get('/api/runtime-status', (_req, res) => {
  res.json(getRuntimeModes());
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

app.post('/api/source-files', async (req, res, next) => {
  try {
    const input = sourceFileUploadSchema.parse(req.body);
    const sourceFile = await saveSourceFileUpload(input);
    res.status(201).json(sourceFile);
  } catch (error) {
    next(error);
  }
});

app.post('/api/prompt-image', async (req, res, next) => {
  try {
    const input = promptImageSchema.parse(req.body);
    const results = [];
    const excludeQuotes = [];
    for (let index = 0; index < input.count; index += 1) {
      let realBackground = null;
      let imageGenerationMode = 'svg-demo';
      let imageGenerationError = '';
      const variantPrompt = [
        input.prompt,
        input.count > 1
          ? `Create post ${index + 1} of ${input.count}. Make the quote unique and create a different background composition, camera angle, lighting, and visual details from the other posts.`
          : ''
      ].join('\n');
      const content = await generateContentPack({
        category: input.category,
        tone: input.tone,
        agentMode: false,
        creativePrompt: variantPrompt,
        openAiPrompt: variantPrompt,
        quoteDescription: variantPrompt,
        day: index + 1,
        totalDays: input.count,
        excludeQuotes
      });
      excludeQuotes.push(content.quote.toLowerCase());

      if (process.env.OPENAI_API_KEY) {
        try {
          realBackground = await generateOpenAIBackgroundImage(variantPrompt, {
            uploadedImagePath: input.uploadedImagePath
          });
          imageGenerationMode = 'openai-real-image';
        } catch (error) {
          imageGenerationError = error.message;
        }
      }

      const cardOptions = {
        category: input.category,
        creatorName: input.creatorName,
        instagramHandle: input.instagramHandle,
        uploadedImagePath: input.uploadedImagePath,
        backgroundDescription: variantPrompt,
        creativePrompt: variantPrompt,
        openAiPrompt: variantPrompt,
        styleVariant: (Date.now() + index) % 9,
        theme: input.theme
      };
      const card = realBackground
        ? await createPhotoQuoteCard(content, { ...cardOptions, backgroundImagePath: realBackground.publicPath })
        : await createQuoteCard(content, cardOptions);

      results.push({
        quote: content.quote,
        caption: content.caption,
        hashtags: content.hashtags,
        imagePath: card.publicPath,
        imageUrl: card.publicUrl,
        backgroundImagePath: realBackground?.publicPath || null,
        generationMode: content.generationMode || (useDemoContent() ? 'demo' : 'live'),
        imageGenerationMode,
        imageGenerationError
      });
    }

    res.status(201).json({ count: results.length, results, ...results[0] });
  } catch (error) {
    next(error);
  }
});

app.post('/api/youtube-cartoon', async (req, res, next) => {
  try {
    const input = cartoonVideoSchema.parse(req.body);
    const results = [];
    for (let index = 0; index < input.days; index += 1) {
      const dayNumber = index + 1;
      const storyboard = await generateCartoonStoryboard({
        ...input,
        dayNumber,
        totalDays: input.days,
        prompt: [
          input.prompt,
          input.days > 1 ? `Create day ${dayNumber} of ${input.days}. The plot, hook, visual setting, and lesson should feel fresh for this day.` : ''
        ].filter(Boolean).join('\n')
      });

      let voiceover = null;
      let voiceError = '';
      if (input.voice) {
        try {
          voiceover = await generateCartoonVoiceover(storyboard, input);
        } catch (error) {
          voiceError = error.message;
        }
      }

      const video = await createCartoonVideo(storyboard, {
        ...input,
        audioPath: voiceover?.publicPath || null
      });
      results.push({
        ...storyboard,
        dayNumber,
        videoPath: video.publicPath,
        videoUrl: video.publicUrl,
        playerPath: video.playerPublicPath,
        playerUrl: video.playerPublicUrl,
        audioPath: voiceover?.publicPath || null,
        audioUrl: voiceover?.publicUrl || null,
        narrationText: voiceover?.narrationText || null,
        voiceError,
        duration: video.totalDuration
      });
    }

    res.status(201).json({ count: results.length, results, ...results[0] });
  } catch (error) {
    next(error);
  }
});

function validatePostContent(content, isDemo, input = {}) {
  const quoteWords = content.quote.trim().split(/\s+/).filter(Boolean).length;
  const isScripture = isScripturePrompt(input);
  const isLuxuryProfile = isLuxuryProfilePrompt(input);
  const minWords = isScripture ? 5 : 8;
  const maxWords = isScripture ? 45 : isLuxuryProfile ? 90 : 18;
  if (quoteWords < minWords || quoteWords > maxWords) {
    throw new Error(`Quote length must be between ${minWords} and ${maxWords} words (got ${quoteWords} words: "${content.quote}").`);
  }

  const tags = content.hashtags || [];
  const uniqueTags = new Set(tags.map((t) => t.toLowerCase()));
  if (uniqueTags.size !== tags.length) {
    throw new Error(`Duplicate hashtags detected: ${tags.join(', ')}`);
  }

  if (isDemo) {
    if (tags.length < 8 || tags.length > 12) {
      throw new Error(`Hashtag count in Demo Mode must be between 8 and 12 (got ${tags.length}).`);
    }
  }
}

async function createScheduledPostCard(content, options) {
  let realBackground = null;
  let imageGenerationMode = 'svg-demo';
  let imageGenerationError = '';
  const visualPrompt = options.visualPrompt || options.backgroundDescription || options.openAiPrompt || options.creativePrompt || '';

  if (shouldGenerateRealImage(visualPrompt)) {
    try {
      realBackground = await generateOpenAIBackgroundImage(visualPrompt, {
        uploadedImagePath: options.uploadedImagePath
      });
      imageGenerationMode = 'openai-real-image';
    } catch (error) {
      imageGenerationError = error.message;
    }
  }

  const card = realBackground
    ? await createPhotoQuoteCard(content, { ...options, backgroundImagePath: realBackground.publicPath })
    : await createQuoteCard(content, options);

  return {
    card,
    backgroundImagePath: realBackground?.publicPath || null,
    imageGenerationMode,
    imageGenerationError
  };
}

function shouldGenerateRealImage(prompt = '') {
  return Boolean(process.env.OPENAI_API_KEY)
    && !/\b(rinism|psychology|black gold|black and gold|save share like|follow for more|profile quote|logo post|luxury quote)\b/i.test(prompt)
    && /\b(real|photorealistic|photo|image|background|church|cathedral|chapel|stained glass|portrait|scene|cinematic|interior|exterior|beach|forest|city|studio|garden|palace|hotel)\b/i.test(prompt);
}

function isLuxuryProfilePrompt(input = {}) {
  return /\b(rinism|psychology|black gold|black and gold|save share like|follow for more|profile quote|luxury quote|validation|self worth)\b/i
    .test(`${input.category || ''} ${input.creativePrompt || ''} ${input.openAiPrompt || ''} ${input.quoteDescription || ''} ${input.backgroundDescription || ''}`);
}

app.post('/api/plan', async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const postTimes = resolvePostTimes(input);
    const totalPosts = input.days * input.postsPerDay;
    const posts = input.replaceExistingSchedule ? [] : getPosts();
    const created = [];
    const campaignId = randomUUID();
    const sourceFile = input.sourceFileId ? await getSourceFile(input.sourceFileId) : null;
    if (input.sourceFileId && !sourceFile) {
      throw new Error('Uploaded source file was not found. Please upload it again.');
    }
    const sourceFileContext = sourceContextForPrompt(sourceFile);
    const agentInput = {
      ...input,
      sourceFile,
      sourceFileContext,
      sourceFileName: sourceFile?.filename || ''
    };
    const agentStrategy = await createAgentStrategy(agentInput);
    let sequenceIndex = 0;

    for (let day = 0; day < input.days; day += 1) {
      const yyyyMmDd = addDaysToDateString(input.startDate, day);
      const dailyMission = getDailyMission(agentStrategy, day, agentInput);

      for (let postIndex = 0; postIndex < input.postsPerDay; postIndex += 1) {
        const scheduledAt = `${yyyyMmDd}T${postTimes[postIndex]}:00`;
        const content = await generateContentPack({
          category: input.category,
          tone: input.tone,
          agentMode: input.agentMode,
          agentGoal: input.agentGoal,
          agentStrategy,
          dailyMission,
          creativePrompt: input.creativePrompt,
          openAiPrompt: input.openAiPrompt,
          referencePost: input.referencePost,
          referencePostImagePath: input.referencePostImagePath,
          quoteDescription: input.quoteDescription,
          sourceFileContext,
          sourceFileName: sourceFile?.filename || '',
          day: sequenceIndex + 1,
          totalDays: totalPosts,
          excludeQuotes: created.map((post) => post.quote.toLowerCase())
        });

        if (useDemoContent()) {
          const isDuplicate = created.some((post) => post.quote.toLowerCase() === content.quote.toLowerCase());
          if (isDuplicate) {
            throw new Error(`Duplicate demo quote generated in the same request: "${content.quote}"`);
          }
        }

        validatePostContent(content, useDemoContent(), input);

        const brand = {
          creatorName: input.creatorName,
          instagramHandle: input.instagramHandle,
          uploadedImagePath: input.uploadedImagePath,
          referencePostImagePath: input.referencePostImagePath,
          backgroundDescription: input.backgroundDescription || input.creativePrompt || input.openAiPrompt,
          openAiPrompt: input.openAiPrompt
        };
        const styleVariant = sequenceIndex % 9;
        const visualPrompt = [
          input.backgroundDescription || '',
          input.openAiPrompt || '',
          input.creativePrompt || '',
          totalPosts > 1
            ? `Post ${sequenceIndex + 1} of ${totalPosts}: make the background composition, camera angle, lighting, and details different from the other posts.`
            : ''
        ].filter(Boolean).join('\n');
        const cardResult = await createScheduledPostCard(content, {
          category: input.category,
          styleVariant,
          theme: input.theme,
          creativePrompt: input.creativePrompt,
          visualPrompt,
          ...brand
        });
        const agentReview = reviewContent(content, agentInput, agentStrategy, dailyMission);
        const post = {
          id: randomUUID(),
          campaignId,
          category: input.category,
          tone: input.tone,
          theme: input.theme,
          agentMode: input.agentMode,
          agentGoal: input.agentGoal,
          agentStrategy,
          agentMission: dailyMission,
          agentQualityScore: agentReview.score,
          agentRationale: agentReview.rationale,
          creativePrompt: input.creativePrompt,
          openAiPrompt: input.openAiPrompt,
          referencePost: input.referencePost,
          referencePostImagePath: input.referencePostImagePath,
          quoteDescription: input.quoteDescription,
          backgroundDescription: input.backgroundDescription || input.creativePrompt || input.openAiPrompt,
          sourceFileId: sourceFile?.id || null,
          sourceFileName: sourceFile?.filename || null,
          sourceFileSummary: sourceFile?.summary || '',
          creatorName: input.creatorName,
          instagramHandle: input.instagramHandle,
          uploadedImagePath: input.uploadedImagePath,
          campaignDays: input.days,
          postsPerDay: input.postsPerDay,
          dayNumber: day + 1,
          postNumberForDay: postIndex + 1,
          postTime: postTimes[postIndex],
          regenerationHistory: [],
          regenerationCount: 0,
          styleVariant,
          scheduledAt,
          status: 'scheduled',
          animationRequested: input.animation,
          quote: content.quote,
          caption: content.caption,
          hashtags: content.hashtags,
          generationMode: content.generationMode || (useDemoContent() ? 'demo' : 'live'),
          imageGenerationMode: cardResult.imageGenerationMode,
          imageGenerationError: cardResult.imageGenerationError,
          backgroundImagePath: cardResult.backgroundImagePath,
          imagePath: cardResult.card.publicPath,
          imageUrl: cardResult.card.publicUrl,
          grokImageUrl: null,
          videoUrl: null,
          instagramMediaId: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        posts.push(post);
        created.push(post);
        sequenceIndex += 1;
      }
    }

    savePosts(posts);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});


function buildRegenerationExclusions(posts, post) {
  const currentCampaignQuotes = posts
    .filter((item) => !post.campaignId || item.campaignId === post.campaignId || item.id === post.id)
    .map((item) => item.quote);
  const historicalQuotes = Array.isArray(post.regenerationHistory)
    ? post.regenerationHistory.map((item) => typeof item === 'string' ? item : item?.quote).filter(Boolean)
    : [];

  return [...new Set([...currentCampaignQuotes, ...historicalQuotes]
    .map((quote) => String(quote || '').trim().toLowerCase())
    .filter(Boolean))];
}

function appendRegenerationHistory(post) {
  const history = Array.isArray(post.regenerationHistory) ? [...post.regenerationHistory] : [];
  const currentQuote = String(post.quote || '').trim();
  const alreadyStored = history.some((item) => {
    const quote = typeof item === 'string' ? item : item?.quote;
    return String(quote || '').trim().toLowerCase() === currentQuote.toLowerCase();
  });

  if (currentQuote && !alreadyStored) {
    history.push({
      quote: currentQuote,
      caption: post.caption || '',
      hashtags: Array.isArray(post.hashtags) ? [...post.hashtags] : [],
      imagePath: post.imagePath || null,
      imageUrl: post.imageUrl || null,
      generationMode: post.generationMode || null,
      replacedAt: new Date().toISOString()
    });
  }

  // A generous cap keeps the persisted JSON bounded while still preventing
  // practical repetition during long editing sessions.
  return history.slice(-100);
}

app.post('/api/posts/:id/regenerate', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const campaignSequence = post.dayNumber && post.postNumberForDay && post.postsPerDay
      ? ((post.dayNumber - 1) * post.postsPerDay) + post.postNumberForDay
      : 1;
    const campaignTotal = post.campaignDays && post.postsPerDay
      ? post.campaignDays * post.postsPerDay
      : 1;

    const content = await generateContentPack({
      category: post.category,
      tone: post.tone,
      agentMode: post.agentMode || false,
      agentGoal: post.agentGoal || '',
      agentStrategy: post.agentStrategy || null,
      dailyMission: post.agentMission || '',
      creativePrompt: post.creativePrompt || '',
      openAiPrompt: post.openAiPrompt || '',
      referencePost: post.referencePost || '',
      referencePostImagePath: post.referencePostImagePath || null,
      quoteDescription: post.quoteDescription || '',
      sourceFileContext: sourceContextForPrompt(await getSourceFile(post.sourceFileId)),
      sourceFileName: post.sourceFileName || '',
      day: campaignSequence,
      totalDays: campaignTotal,
      // Exclude every current campaign quote plus every earlier version of this post.
      // This prevents Demo Mode from bouncing A↔B and gives live OpenAI a durable
      // "never reuse these versions" history across repeated regenerations/restarts.
      excludeQuotes: buildRegenerationExclusions(posts, post)
    });

    validatePostContent(content, useDemoContent(), post);

    const cardResult = await createScheduledPostCard(content, {
      category: post.category,
      creatorName: post.creatorName || 'Rini',
      instagramHandle: post.instagramHandle || '@getholisticallyfitwithrini',
      uploadedImagePath: post.uploadedImagePath,
      referencePostImagePath: post.referencePostImagePath || null,
      backgroundDescription: post.backgroundDescription || post.creativePrompt || '',
      styleVariant: post.styleVariant || 0,
      theme: post.theme || 'minimalLight',
      creativePrompt: post.creativePrompt || '',
      openAiPrompt: post.openAiPrompt || '',
      visualPrompt: [post.backgroundDescription || '', post.openAiPrompt || '', post.creativePrompt || ''].filter(Boolean).join('\n')
    });
    const agentReview = reviewContent(content, {
      category: post.category,
      tone: post.tone,
      instagramHandle: post.instagramHandle || '@getholisticallyfitwithrini'
    }, post.agentStrategy || null, post.agentMission || '');

    const regenerationHistory = appendRegenerationHistory(post);
    Object.assign(post, {
      quote: content.quote,
      caption: content.caption,
      hashtags: content.hashtags,
      generationMode: content.generationMode || (useDemoContent() ? 'demo' : 'live'),
      imageGenerationMode: cardResult.imageGenerationMode,
      imageGenerationError: cardResult.imageGenerationError,
      backgroundImagePath: cardResult.backgroundImagePath,
      agentQualityScore: agentReview.score,
      agentRationale: agentReview.rationale,
      imagePath: cardResult.card.publicPath,
      imageUrl: cardResult.card.publicUrl,
      regenerationHistory,
      regenerationCount: regenerationHistory.length,
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

    if (useDemoImages()) {
      post.grokImageUrl = post.imageUrl;
      post.imageGenerationMode = 'svg-demo';
      post.updatedAt = new Date().toISOString();
      savePosts(posts);
      return res.json(post);
    }


    try {
      const grokImage = await generateGrokImage(post);
      post.grokImageUrl = grokImage.url;
      post.imageGenerationMode = 'xai';
    } catch (err) {
      post.imageGenerationMode = 'svg-demo';
      throw err;
    }

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

    if (useDemoImages()) {
      post.videoUrl = post.imageUrl;
      post.updatedAt = new Date().toISOString();
      savePosts(posts);
      return res.json(post);
    }


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

    if (useDemoPublishing()) {
      post.status = 'publishing';
      post.updatedAt = new Date().toISOString();
      savePosts(posts);

      // simulate delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      post.status = 'published';
      post.instagramMediaId = `DEMO_${Math.floor(100000 + Math.random() * 900000)}`;
      post.publishingMode = 'demo';
      post.error = null;
      post.updatedAt = new Date().toISOString();
      savePosts(posts);
      return res.json(post);
    }


    const result = await publishToInstagram(post);
    post.status = 'published';
    post.instagramMediaId = result.mediaId;
    post.publishingMode = 'live';
    post.error = null;
    post.updatedAt = new Date().toISOString();
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:id/regenerate-hashtags', async (req, res, next) => {
  try {
    const posts = getPosts();
    const post = posts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (useDemoContent()) {
      const { getDemoHashtags } = await import('./data/hashtags.js');
      post.hashtags = getDemoHashtags(post.category);
      post.updatedAt = new Date().toISOString();
      savePosts(posts);
      return res.json(post);
    }


    const OpenAI = (await import('openai')).default;
    const { normalizeHashtags } = await import('./data/hashtags.js');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Based on this Instagram quote post: "${post.quote}", suggest 8-12 relevant, distinct hashtags. Return strict JSON array of strings containing hashtags only under key "hashtags".`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'hashtags_suggestion',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['hashtags'],
            properties: {
              hashtags: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    });

    const parsed = JSON.parse(response.output_text);
    post.hashtags = normalizeHashtags(parsed.hashtags);
    post.updatedAt = new Date().toISOString();
    savePosts(posts);
    res.json(post);
  } catch (error) {
    next(error);
  }
});

app.get('/api/integrations/instagram/status', async (req, res, next) => {
  try {
    if (useDemoPublishing()) {
      return res.json({
        status: 'connected',
        mode: 'demo',
        message: 'Instagram: Demo Connection\nPublishing: Simulated',
        username: 'demo_user'
      });
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igUserId = process.env.INSTAGRAM_IG_USER_ID;
    if (!accessToken || !igUserId) {
      return res.json({
        status: 'disconnected',
        mode: 'live',
        error: 'Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_IG_USER_ID'
      });
    }

    try {
      const info = await validateCredentials();
      res.json({
        status: 'connected',
        mode: 'live',
        username: info.username
      });
    } catch (err) {
      res.json({
        status: 'error',
        mode: 'live',
        error: err.message
      });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/suggest-creative-direction', async (req, res, next) => {
  try {
    const { category, tone } = req.body;
    if (useDemoContent()) {
      const suggestions = [
        "Minimal Light: clean layout, thin fonts, pastel colors, wellness focus",
        "Minimal Dark: dark background, white text, technology aesthetic",
        "Luxury: gold accents, elegant fonts, dark background, premium branding",
        "Nature: green and blue gradients, organic shapes, calm typography",
        "Bold Motivation: high contrast, big typography, dynamic shapes",
        "Sunrise: warm yellow and orange gradients, uplifting tone",
        "Ocean: deep blue waves, white text, serene mood",
        "Desert: sand tones, minimalist lines, warm calm aesthetic"
      ];
      const selected = suggestions[Math.floor(Math.random() * suggestions.length)];
      return res.json({ suggestion: selected });
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Suggest a short Creative Direction description (under 25 words) for an Instagram brand post in category "${category}" with a "${tone}" tone. Focus on background style, colors, and typography mood. Return the text only.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: prompt
    });

    const suggestion = response.output_text.trim();
    res.json({ suggestion });
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

app.delete('/api/posts', (_req, res) => {
  savePosts([]);
  res.status(204).end();
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

function resolvePostTimes(input) {
  const requestedCount = input.postsPerDay || 1;
  const providedTimes = Array.isArray(input.postTimes)
    ? input.postTimes.map((time) => String(time).trim()).filter(Boolean)
    : [];

  if (providedTimes.length > 0 && providedTimes.length !== requestedCount) {
    throw new Error(`Please provide exactly ${requestedCount} posting time${requestedCount === 1 ? '' : 's'}.`);
  }

  const resolved = providedTimes.length
    ? providedTimes
    : buildDefaultPostTimes(requestedCount, input.postTime || '09:00');

  if (new Set(resolved).size !== resolved.length) {
    throw new Error('Each daily post must have a different posting time.');
  }

  return resolved;
}

function buildDefaultPostTimes(count, firstTime) {
  if (count === 1) return [firstTime];

  const presets = {
    2: ['09:00', '18:00'],
    3: ['09:00', '14:00', '19:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
    5: ['08:00', '11:00', '14:00', '17:00', '20:00']
  };
  if (presets[count] && firstTime === '09:00') return presets[count];

  const [firstHour, firstMinute] = firstTime.split(':').map(Number);
  const startMinutes = firstHour * 60 + firstMinute;
  const availableMinutes = Math.max(60, (24 * 60 - startMinutes - 30));
  const step = Math.max(60, Math.floor(availableMinutes / count));

  return Array.from({ length: count }, (_, index) => {
    const totalMinutes = (startMinutes + step * index) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
}

function isScripturePrompt(input = {}) {
  return /\b(bible|biblical|scripture|verse|psalm|proverb|church|jesus|christian|gospel)\b/i
    .test(`${input.category || ''} ${input.creativePrompt || ''} ${input.openAiPrompt || ''} ${input.quoteDescription || ''} ${input.backgroundDescription || ''}`);
}

function publicPathToFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/')) return null;
  return path.join(root, 'public', publicPath.replace(/^\//, ''));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'post';
}
