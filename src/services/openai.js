import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDemoContent } from '../data/demoContent.js';
import { getDemoHashtags, normalizeHashtags } from '../data/hashtags.js';
import { useDemoContent } from '../runtimeMode.js';
import {
  INFOGRAPHIC_JSON_SCHEMA,
  buildDemoInfographicData,
  infographicPromptLines,
  normalizeInfographicData
} from './infographicContent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

const fallbackQuotes = [
  'Your worth is not waiting for permission.',
  'Small promises kept to yourself become quiet confidence.',
  'You do not have to shrink to make your peace easier for others.',
  'Healing starts when your own voice becomes a safe place to return to.',
  'Let today be proof that softness can still have boundaries.'
];

// Every template gets quote/caption/hashtags. educational_infographic posts also
// get infographicData; all other templates go through generateBaseContent unchanged.
export async function generateContentPack(params) {
  if (params.templateId !== 'educational_infographic') {
    return generateBaseContent(params);
  }

  const demoInfographic = (content, source) => ({
    ...buildDemoInfographicData({
      category: params.category,
      quote: content.quote,
      day: params.day,
      totalDays: params.totalDays,
      // Grows with every generated post and every regeneration, so a new frame is picked each time.
      variant: (params.excludeQuotes || []).length
    }),
    source
  });

  if (useDemoContent()) {
    const content = await generateBaseContent(params);
    return { ...content, infographicData: demoInfographic(content, 'demo') };
  }

  try {
    const content = await generateBaseContent(params, { withInfographic: true });
    if (content.generationMode !== 'live') {
      // OpenAI was unavailable (quota, rate limit...) and demo copy was used instead.
      return { ...content, infographicData: demoInfographic(content, 'fallback') };
    }
    const { infographicData, ...rest } = content;
    return { ...rest, infographicData: normalizeInfographicData(infographicData, demoInfographic(content, 'fallback')) };
  } catch (error) {
    // Keep the existing behaviour when OpenAI keeps repeating excluded quotes.
    if (/repeated an excluded quote/i.test(error.message)) throw error;
    // Anything else about the structured request (bad JSON, schema rejected...):
    // generate the normal post and attach deterministic infographic data.
    console.warn(`Structured infographic generation failed, using fallback data: ${error.message}`);
    const content = await generateBaseContent(params);
    return { ...content, infographicData: demoInfographic(content, 'fallback') };
  }
}

async function generateBaseContent({
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
}, { withInfographic = false } = {}) {
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
    'You are a critical-thinking partner, not an agreement machine. You must NOT blindly validate or agree with the user\'s premise or input idea.',
    'Before generating the post copy, internally evaluate: What are the actual facts? What assumptions is the user making? What information/perspective is missing? What is the strongest opposing interpretation? Is there confirmation bias or exaggeration? How can the idea be made more accurate and intellectually stronger?',
    'Keep this reasoning internal. Do not expose chain-of-thought or hidden reasoning in the final JSON output.',
    'When appropriate, structure the generated post copy (using the quote and caption fields) to follow this framework: Hook → Problem/Bias → Reframe → Better Question/Prompt → Strong Close.',
    'Ensure the content feels intelligent, psychologically insightful, concise, challenging, thought-provoking, and useful (not preachy, generic, or blindly supportive).',
    agentMode
      ? 'You are the creator agent for this Instagram brand. Make a deliberate, critical-thinking content decision, then produce the post copy.'
      : 'Create one Instagram quote post.',
    `Category: ${category}.`,
    agentGoal ? `Agent goal: ${agentGoal}.` : '',
    agentStrategy ? `Strategy summary: ${agentStrategy.strategySummary}. Audience insight: ${agentStrategy.audienceInsight}. Content pillars: ${agentStrategy.contentPillars.join(', ')}.` : '',
    dailyMission ? `Today\'s agent mission: ${dailyMission}.` : '',
    sourceFileContext
      ? `Uploaded source file context${sourceFileName ? ` from ${sourceFileName}` : ''}. Use it as the main raw material for this post. Do not copy long passages verbatim; transform its ideas into original Instagram content:\n${truncateForPrompt(sourceFileContext, 8000)}`
      : '',
    creativePrompt
      ? `Creative prompt from user: ${creativePrompt}. Treat this as a primary instruction, not a loose suggestion. If it asks for a topic, format, reference, background, audience, or uniqueness rule, follow it. Interpret this direction critically, challenge weak ideas, and innovate within this direction while keeping the final quote concise and original.`
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
      ? `Specific quote direction: ${quoteDescription}. Challenge the assumptions of this direction if needed, while keeping the quote original.`
      : 'No specific quote direction was provided. Use only the category to decide the quote idea.',
    excludeQuotes.length
      ? `Do not repeat or closely paraphrase any of these earlier/current quotes. Choose a genuinely new angle, hook, wording, and reframe: ${uniqueQuoteExclusions(excludeQuotes).slice(-60).map((quote) => `"${quote}"`).join(' | ')}`
      : '',
    scripturePrompt
      ? 'The user is asking for Bible verse posts. Make every post unique. Include a Bible book/chapter/verse reference in the quote itself, such as "Psalm 46:10 - Be still and know that He is God." Use respectful Christian wording, and do not invent fake references.'
      : '',
    `Tone: ${tone}. This is day ${day} of ${totalDays}.`,
    withInfographic
      ? 'Return strict JSON with keys quote, caption, hashtags, infographicData.'
      : 'Return strict JSON with keys quote, caption, hashtags.',
    scripturePrompt
      ? 'Quote: include the Bible reference, then a short verse excerpt or faithful paraphrase. Aim for 8-28 words, never exceed 45 words, and keep it readable on an Instagram graphic.'
      : luxuryProfilePrompt
        ? 'Quote: 28-70 words, emotionally sharp psychology/self-worth style, elegant and memorable. Do not use markdown.'
      : 'The quote should be the core Hook or Reframe (8-18 words, original, emotionally clear).',
    'The caption should deliver the rest of the framework (1-2 sentences with no markdown, completing the Hook → Problem/Bias → Reframe → Better Question/Prompt → Strong Close flow).',
    'Hashtags: 6-10 concise tags.',
    ...(withInfographic ? infographicPromptLines() : [])
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
    const uniqueExclusions = uniqueQuoteExclusions(excludeQuotes);
    const excludedKeys = new Set(uniqueExclusions.map(normalizeQuoteKey));
    let lastDuplicateQuote = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const retryInput = attempt === 0
        ? input
        : typeof input === 'string'
          ? `${input}\nA previous regeneration attempt repeated an excluded idea ("${lastDuplicateQuote}"). Produce a substantially different angle and wording.`
          : input.map((message, index) => index === input.length - 1
            ? {
                ...message,
                content: [
                  ...message.content,
                  { type: 'input_text', text: `A previous regeneration attempt repeated an excluded idea ("${lastDuplicateQuote}"). Produce a substantially different angle and wording.` }
                ]
              }
            : message);

      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        input: retryInput,
        text: {
          format: {
            type: 'json_schema',
            name: 'instagram_quote',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: withInfographic ? ['quote', 'caption', 'hashtags', 'infographicData'] : ['quote', 'caption', 'hashtags'],
              properties: {
                quote: { type: 'string' },
                caption: { type: 'string' },
                hashtags: { type: 'array', items: { type: 'string' } },
                ...(withInfographic ? { infographicData: INFOGRAPHIC_JSON_SCHEMA } : {})
              }
            }
          }
        }
      });

      const parsed = JSON.parse(response.output_text);
      const quoteKey = normalizeQuoteKey(parsed.quote);
      const tooSimilar = uniqueExclusions.some((existing) => quoteSimilarity(parsed.quote, existing) >= 0.72);
      if (!excludedKeys.has(quoteKey) && !tooSimilar) {
        return {
          quote: parsed.quote,
          caption: parsed.caption,
          hashtags: normalizeHashtags(parsed.hashtags),
          generationMode: 'live',
          ...(withInfographic ? { infographicData: parsed.infographicData } : {})
        };
      }
      lastDuplicateQuote = parsed.quote;
    }

    throw new Error('OpenAI repeated an excluded quote after multiple regeneration attempts. Please regenerate again.');
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


function uniqueQuoteExclusions(excludeQuotes = []) {
  const seen = new Set();
  const result = [];
  for (const value of excludeQuotes) {
    const quote = String(value || '').trim();
    const key = normalizeQuoteKey(quote);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(quote);
  }
  return result;
}

function normalizeQuoteKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[“”‘’'\"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}


function quoteSimilarity(left = '', right = '') {
  const leftTokens = new Set(normalizeQuoteKey(left).split(/\s+/).filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeQuoteKey(right).split(/\s+/).filter((token) => token.length > 2));
  if (leftTokens.size < 4 || rightTokens.size < 4) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
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
