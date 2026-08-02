import OpenAI from 'openai';
import { useDemoContent } from '../runtimeMode.js';

export async function createAgentStrategy(input) {
  if (!input.agentMode) return null;

  if (useDemoContent()) {
    return fallbackStrategy(input);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    'Act as an autonomous Instagram content strategist for a personal brand.',
    `Brand/creator: ${input.creatorName} (${input.instagramHandle}).`,
    `Category: ${input.category}. Tone: ${input.tone}.`,
    input.agentGoal ? `Brand goal: ${input.agentGoal}.` : 'Brand goal: grow trust, saves, and daily engagement.',
    input.creativePrompt ? `Creative prompt: ${input.creativePrompt}.` : '',
    input.referencePost ? `Reference post to emulate without copying:\n${truncateForPrompt(input.referencePost, 2500)}` : '',
    input.referencePostImagePath ? 'A reference post image was uploaded. Keep the strategy aligned with its visual style, hierarchy, mood, and audience signal without copying the exact design.' : '',
    input.quoteDescription ? `Quote direction: ${input.quoteDescription}.` : '',
    input.backgroundDescription ? `Visual direction: ${input.backgroundDescription}.` : '',
    input.sourceFileContext
      ? `Uploaded source material to mine for themes, language, ideas, and monthly content angles:\n${truncateForPrompt(input.sourceFileContext, 12000)}`
      : '',
    `Create a ${input.days}-day content strategy.`,
    'Return strict JSON with strategySummary, audienceInsight, contentPillars, and dailyMissions.',
    'dailyMissions must contain one short mission per day.'
  ].filter(Boolean).join('\n');

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'agent_strategy',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['strategySummary', 'audienceInsight', 'contentPillars', 'dailyMissions'],
            properties: {
              strategySummary: { type: 'string' },
              audienceInsight: { type: 'string' },
              contentPillars: { type: 'array', items: { type: 'string' } },
              dailyMissions: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    });

    const parsed = JSON.parse(response.output_text);
    return normalizeStrategy(parsed, input);
  } catch (error) {
    if (isRecoverableOpenAIError(error)) return fallbackStrategy(input);
    throw error;
  }
}

function isRecoverableOpenAIError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.status === 429
    || message.includes('quota')
    || message.includes('rate limit')
    || message.includes('billing')
    || message.includes('model');
}

export function getDailyMission(strategy, dayIndex, input) {
  if (!strategy) return '';
  return strategy.dailyMissions[dayIndex] || `Create a ${input.tone.toLowerCase()} ${input.category} post that deepens trust.`;
}

export function reviewContent(content, input, strategy, dailyMission) {
  const quoteWords = content.quote.trim().split(/\s+/).filter(Boolean).length;
  const hasHandle = Boolean(input.instagramHandle);
  const hasEnoughTags = Array.isArray(content.hashtags) && content.hashtags.length >= 4;
  const missionFit = dailyMission ? 2 : 1;
  const quoteFit = quoteWords >= 6 && quoteWords <= 22 ? 3 : 1;
  const captionFit = content.caption.length <= 220 ? 2 : 1;
  const brandFit = hasHandle ? 2 : 1;
  const tagFit = hasEnoughTags ? 1 : 0;
  const score = Math.min(10, quoteFit + captionFit + brandFit + tagFit + missionFit);

  return {
    score,
    rationale: [
      `Mission: ${dailyMission || 'Use category-led content direction.'}`,
      `Quote length: ${quoteWords} words.`,
      `Branding: ${hasHandle ? 'handle included' : 'handle missing'}.`,
      `Hashtags: ${content.hashtags.length}.`
    ].join(' ')
  };
}

function normalizeStrategy(strategy, input) {
  const dailyMissions = Array.from({ length: input.days }, (_, index) => {
    return strategy.dailyMissions[index] || `Day ${index + 1}: build emotional trust around ${input.category}.`;
  });
  return {
    strategySummary: strategy.strategySummary || `Build a ${input.days}-day ${input.category} content arc.`,
    audienceInsight: strategy.audienceInsight || 'Audience wants concise emotional clarity and visually polished reminders.',
    contentPillars: strategy.contentPillars?.length ? strategy.contentPillars.slice(0, 6) : defaultPillars(input.category),
    dailyMissions
  };
}

function fallbackStrategy(input) {
  return normalizeStrategy({
    strategySummary: input.sourceFileName
      ? `Build a ${input.days}-day content arc from ${input.sourceFileName}, turning its strongest ideas into daily save-worthy posts.`
      : `Build a ${input.days}-day content arc that turns ${input.category} into daily save-worthy reminders.`,
    audienceInsight: 'Audience responds to precise emotional truths, confident boundaries, and elegant visual consistency.',
    contentPillars: defaultPillars(input.category),
    dailyMissions: Array.from({ length: input.days }, (_, index) => {
      const pillar = defaultPillars(input.category)[index % defaultPillars(input.category).length];
      const sourcePrefix = input.sourceFileName ? `Use one idea from ${input.sourceFileName}. ` : '';
      return `${sourcePrefix}Create a ${pillar.toLowerCase()} post for women who want ${input.category.toLowerCase()} to feel practical and personal.`;
    })
  }, input);
}

function truncateForPrompt(value, maxChars) {
  const text = String(value || '').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}\n...[truncated]` : text;
}

function defaultPillars(category) {
  return [
    `${category} clarity`,
    'self-trust',
    'emotional boundaries',
    'quiet confidence',
    'healing identity'
  ];
}
