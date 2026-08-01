import OpenAI from 'openai';
import { getDemoContent } from '../data/demoContent.js';
import { getDemoHashtags, normalizeHashtags } from '../data/hashtags.js';
import { useDemoContent } from '../runtimeMode.js';

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
  quoteDescription = '',
  day,
  totalDays,
  excludeQuotes = []
}) {
  if (useDemoContent()) {
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
    creativePrompt
      ? `Creative prompt from user: ${creativePrompt}. Interpret this like a ChatGPT creative brief. Innovate within this direction, but keep the final quote concise and original.`
      : 'No broad creative prompt was provided. Innovate from the structured fields only.',
    quoteDescription
      ? `Specific quote direction: ${quoteDescription}. Follow this direction closely while keeping the quote original.`
      : 'No specific quote direction was provided. Use only the category to decide the quote idea.',
    `Tone: ${tone}. This is day ${day} of ${totalDays}.`,
    'Return strict JSON with keys quote, caption, hashtags.',
    'Quote: 8-18 words, original, emotionally clear.',
    'Caption: 1-2 short sentences with no markdown.',
    'Hashtags: 6-10 concise tags.'
  ].join('\n');

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    input: prompt,
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
}

function buildHashtags(category) {
  const compact = category.replace(/[^a-z0-9]/gi, '');
  return [`#${compact}`, '#MindsetMatters', '#DailyQuote', '#SelfGrowth', '#InspiredLiving', '#InnerWork'];
}
