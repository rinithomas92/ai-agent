import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDemoContent } from '../data/demoContent.js';
import { getDemoHashtags, normalizeHashtags } from '../data/hashtags.js';
import { useDemoContent } from '../runtimeMode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

const fallbackQuotes = [
  'Your worth is not waiting for permission.',
  'Small promises kept to yourself become quiet confidence.',
  'You do not have to shrink to make your peace easier for others.',
  'Healing starts when your own voice becomes a safe place to return to.',
  'Let today be proof that softness can still have boundaries.'
];

export async function generateContentPack({
  category,
  tone,
  agentMode = false,
  agentGoal = '',
  agentStrategy = null,
  dailyMission = '',
  creativePrompt = '',
  openAiPrompt = '',
  referencePost = '',
  referencePostImagePath = null,
  quoteDescription = '',
  sourceFileContext = '',
  sourceFileName = '',
  day,
  totalDays,
  excludeQuotes = []
}) {
  const scripturePrompt = isScripturePrompt({ category, creativePrompt, openAiPrompt, quoteDescription, sourceFileContext });
  const luxuryProfilePrompt = isLuxuryProfilePrompt({ category, creativePrompt, openAiPrompt, quoteDescription, sourceFileContext });
  if (useDemoContent()) {
    if (scripturePrompt) {
      return getDemoScriptureContent(day, excludeQuotes);
    }
    const demo = getDemoContent(category, day - 1, excludeQuotes);
    const hashtags = getDemoHashtags(category);
    return {
      quote: demo.quote,
      caption: demo.caption,
      hashtags,
      generationMode: 'demo'
    };
  }


  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    agentMode
      ? 'You are the creator agent for this Instagram brand. Make a deliberate content decision, then produce the post copy.'
      : 'Create one Instagram quote post.',
    `Category: ${category}.`,
    agentGoal ? `Agent goal: ${agentGoal}.` : '',
    agentStrategy ? `Strategy summary: ${agentStrategy.strategySummary}. Audience insight: ${agentStrategy.audienceInsight}. Content pillars: ${agentStrategy.contentPillars.join(', ')}.` : '',
    dailyMission ? `Today\'s agent mission: ${dailyMission}.` : '',
    sourceFileContext
      ? `Uploaded source file context${sourceFileName ? ` from ${sourceFileName}` : ''}. Use it as the main raw material for this post. Do not copy long passages verbatim; transform its ideas into original Instagram content:\n${truncateForPrompt(sourceFileContext, 8000)}`
      : '',
    creativePrompt
      ? `Creative prompt from user: ${creativePrompt}. Treat this as a primary instruction, not a loose suggestion. If it asks for a topic, format, reference, background, audience, or uniqueness rule, follow it.`
      : 'No broad creative prompt was provided. Innovate from the structured fields only.',
    openAiPrompt
      ? `Direct OpenAI prompt from user: ${openAiPrompt}. Follow this instruction closely for the quote, caption, structure, references, and uniqueness rules. If it conflicts with visual/background directions, keep this instruction for copy and use the background field for visuals.`
      : '',
    referencePost
      ? `Reference post supplied by user. Create a similar post in tone, structure, emotional angle, and audience fit, but do not copy exact sentences, proprietary wording, or distinctive phrasing:\n${truncateForPrompt(referencePost, 2500)}`
      : '',
    referencePostImagePath
      ? 'A reference post image is attached. Study its composition, spacing, typography mood, color direction, image/text balance, and premium feel. Use it as inspiration only; do not copy the design exactly.'
      : '',
    quoteDescription
      ? `Specific quote direction: ${quoteDescription}. Follow this direction closely while keeping the quote original.`
      : 'No specific quote direction was provided. Use only the category to decide the quote idea.',
    scripturePrompt
      ? 'The user is asking for Bible verse posts. Make every post unique. Include a Bible book/chapter/verse reference in the quote itself, such as "Psalm 46:10 - Be still and know that He is God." Use respectful Christian wording, and do not invent fake references.'
      : '',
    `Tone: ${tone}. This is day ${day} of ${totalDays}.`,
    'Return strict JSON with keys quote, caption, hashtags.',
    scripturePrompt
      ? 'Quote: include the Bible reference, then a short verse excerpt or faithful paraphrase. Aim for 8-28 words, never exceed 45 words, and keep it readable on an Instagram graphic.'
      : luxuryProfilePrompt
        ? 'Quote: 28-70 words, emotionally sharp psychology/self-worth style, elegant and memorable. Do not use markdown.'
      : 'Quote: 8-18 words, original, emotionally clear.',
    'Caption: 1-2 short sentences with no markdown.',
    'Hashtags: 6-10 concise tags.'
  ].join('\n');

  const referenceImageDataUri = await readPublicImageAsDataUri(referencePostImagePath);
  const input = referenceImageDataUri
    ? [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: referenceImageDataUri }
        ]
      }]
    : prompt;

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'instagram_quote',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['quote', 'caption', 'hashtags'],
            properties: {
              quote: { type: 'string' },
              caption: { type: 'string' },
              hashtags: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    });

    const raw = response.output_text;
    const parsed = JSON.parse(raw);
    return {
      quote: parsed.quote,
      caption: parsed.caption,
      hashtags: normalizeHashtags(parsed.hashtags),
      generationMode: 'live'
    };
  } catch (error) {
    if (isRecoverableOpenAIError(error)) {
      if (scripturePrompt) return getDemoScriptureContent(day, excludeQuotes);
      const demo = getDemoContent(category, day - 1, excludeQuotes);
      return {
        quote: demo.quote,
        caption: demo.caption,
        hashtags: getDemoHashtags(category),
        generationMode: 'demo'
      };
    }
    throw error;
  }
}

async function readPublicImageAsDataUri(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return null;
  const filePath = path.join(root, 'public', publicPath.replace(/^\//, ''));
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = await fs.readFile(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function truncateForPrompt(value, maxChars) {
  const text = String(value || '').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}\n...[truncated]` : text;
}

function isScripturePrompt({ category = '', creativePrompt = '', openAiPrompt = '', quoteDescription = '', sourceFileContext = '' }) {
  return /\b(bible|biblical|scripture|verse|psalm|proverb|church|jesus|christian|gospel)\b/i
    .test(`${category} ${creativePrompt} ${openAiPrompt} ${quoteDescription} ${sourceFileContext}`);
}

function isLuxuryProfilePrompt({ category = '', creativePrompt = '', openAiPrompt = '', quoteDescription = '', sourceFileContext = '' }) {
  return /\b(rinism|psychology|black gold|black and gold|save share like|follow for more|profile quote|luxury quote|validation|self worth)\b/i
    .test(`${category} ${creativePrompt} ${openAiPrompt} ${quoteDescription} ${sourceFileContext}`);
}

function isRecoverableOpenAIError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.status === 429
    || message.includes('quota')
    || message.includes('rate limit')
    || message.includes('billing')
    || message.includes('model');
}

function getDemoScriptureContent(day, excludeQuotes = []) {
  const verses = [
    ['Psalm 46:10', 'Be still and know that He is God.'],
    ['Proverbs 3:5', 'Trust in the Lord with all your heart.'],
    ['Philippians 4:13', 'I can do all things through Christ who strengthens me.'],
    ['Isaiah 41:10', 'Do not fear, for God is with you.'],
    ['Jeremiah 29:11', 'God has plans to give you hope and a future.'],
    ['Matthew 11:28', 'Come to Him when you are weary, and find rest.'],
    ['Romans 8:28', 'God works all things together for good.'],
    ['Joshua 1:9', 'Be strong and courageous; the Lord is with you.'],
    ['Psalm 23:1', 'The Lord is your shepherd; you lack nothing.'],
    ['John 14:27', 'His peace is given, not as the world gives.'],
    ['2 Corinthians 5:7', 'Walk by faith, not by sight.'],
    ['Psalm 119:105', 'His word is a lamp to your feet.'],
    ['Romans 15:13', 'May the God of hope fill you with joy and peace.'],
    ['1 Peter 5:7', 'Cast every anxiety on Him because He cares for you.'],
    ['Lamentations 3:23', 'His mercies are new every morning.'],
    ['Matthew 5:16', 'Let your light shine before others.'],
    ['James 1:5', 'Ask God for wisdom, and He gives generously.'],
    ['Psalm 34:18', 'The Lord is close to the brokenhearted.'],
    ['Ephesians 2:10', "You are God's workmanship, created for good works."],
    ['Hebrews 11:1', 'Faith is confidence in what we hope for.'],
    ['Psalm 27:1', 'The Lord is your light and salvation.'],
    ['Galatians 6:9', 'Do not grow weary in doing good.'],
    ['Colossians 3:23', 'Work heartily, as for the Lord.'],
    ['1 John 4:19', 'We love because He first loved us.'],
    ['Psalm 91:2', 'He is your refuge and fortress.'],
    ['Micah 6:8', 'Act justly, love mercy, and walk humbly with God.'],
    ['John 15:5', 'Apart from Him, you can do nothing.'],
    ['Romans 12:12', 'Be joyful in hope, patient in trouble, faithful in prayer.'],
    ['Isaiah 40:31', 'Those who hope in the Lord renew their strength.'],
    ['Numbers 6:24', 'The Lord bless you and keep you.']
  ];
  const excluded = new Set(excludeQuotes.map((quote) => quote.toLowerCase()));
  const start = Math.max(0, day - 1);
  const selected = verses.slice(start).concat(verses.slice(0, start))
    .find(([reference, text]) => !excluded.has(`${reference} - ${text}`.toLowerCase())) || verses[start % verses.length];
  const [reference, text] = selected;
  const quote = `${reference} - ${text}`;
  return {
    quote,
    caption: `Day ${day}: Carry this scripture into today with a quiet heart and steady faith.`,
    hashtags: ['#BibleVerse', '#DailyScripture', '#FaithPost', '#ChristianInspiration', '#VerseOfTheDay', '#ChurchCommunity', '#PrayerLife', '#GodsWord'],
    generationMode: 'demo'
  };
}
