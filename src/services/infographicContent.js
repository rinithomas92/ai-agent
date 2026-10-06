// Structured content for the educational_infographic template.
//
// infographicData shape (every field is always present after normalization):
// {
//   seriesLabel, dayLabel, headline, subheadline,
//   leftBlock:  { title, subtitle, points: [2-4] },
//   rightBlock: { title, subtitle, points: [2-4] },
//   useCases: [3-6], example: { input, output }, takeaways: [1-3],
//   closingNote, source: 'demo' | 'live' | 'fallback'
// }

export const INFOGRAPHIC_LIMITS = {
  seriesLabel: 32,
  dayLabel: 14,
  headline: 65,
  subheadline: 90,
  blockTitle: 22,
  blockSubtitle: 40,
  point: 55,
  points: { min: 2, max: 4 },
  useCase: 16,
  useCases: { min: 3, max: 6 },
  example: 70,
  takeaway: 70,
  takeaways: { min: 1, max: 3 },
  closingNote: 110
};

// JSON schema sent to OpenAI (only for educational_infographic posts).
export const INFOGRAPHIC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['seriesLabel', 'dayLabel', 'headline', 'subheadline', 'leftBlock', 'rightBlock', 'useCases', 'example', 'takeaways', 'closingNote'],
  properties: {
    seriesLabel: { type: 'string' },
    dayLabel: { type: 'string' },
    headline: { type: 'string' },
    subheadline: { type: 'string' },
    leftBlock: blockSchema(),
    rightBlock: blockSchema(),
    useCases: { type: 'array', items: { type: 'string' } },
    example: {
      type: 'object',
      additionalProperties: false,
      required: ['input', 'output'],
      properties: { input: { type: 'string' }, output: { type: 'string' } }
    },
    takeaways: { type: 'array', items: { type: 'string' } },
    closingNote: { type: 'string' }
  }
};

function blockSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'subtitle', 'points'],
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      points: { type: 'array', items: { type: 'string' } }
    }
  };
}

// Prompt lines appended for educational posts in live mode.
export function infographicPromptLines() {
  const L = INFOGRAPHIC_LIMITS;
  return [
    'This post is an educational infographic. Also return infographicData: a compact two-sided comparison that teaches one idea from this category.',
    `infographicData rules: headline max ${L.headline} characters; subheadline max ${L.subheadline}; leftBlock and rightBlock each have a title (max ${L.blockTitle}), a subtitle (max ${L.blockSubtitle}) and 3-4 points (each max ${L.point}).`,
    `leftBlock is the common or weaker approach, rightBlock the better approach. useCases: 4-6 one- or two-word situations where the better approach helps (each max ${L.useCase}).`,
    `example: a realistic before (input) and after (output) line, each max ${L.example}. takeaways: exactly 3 short sentences (each max ${L.takeaway}). closingNote: one memorable line (max ${L.closingNote}).`,
    'seriesLabel is a short uppercase series name based on the category (for example "MINDSET MINI SERIES"); dayLabel is like "DAY 3". Plain text only, no markdown, no emoji.'
  ];
}

// ---------------------------------------------------------------------------
// Normalization: clamp lengths and counts; fill anything missing from fallback.
// ---------------------------------------------------------------------------

export function normalizeInfographicData(raw, fallback) {
  const L = INFOGRAPHIC_LIMITS;
  const data = raw && typeof raw === 'object' ? raw : {};
  const text = (value, max, fallbackValue) => clip(value, max) || fallbackValue;
  const list = (values, max, { min, max: maxItems }, fallbackValues) => {
    const items = (Array.isArray(values) ? values : []).map((value) => clip(value, max)).filter(Boolean).slice(0, maxItems);
    return items.length >= min ? items : fallbackValues;
  };
  const block = (value, fallbackBlock) => {
    const source = value && typeof value === 'object' ? value : {};
    return {
      title: text(source.title, L.blockTitle, fallbackBlock.title),
      subtitle: text(source.subtitle, L.blockSubtitle, fallbackBlock.subtitle),
      points: list(source.points, L.point, L.points, fallbackBlock.points)
    };
  };
  const example = data.example && typeof data.example === 'object' ? data.example : {};

  // The core teaching content must come from the model; otherwise use the fallback whole.
  const coreValid = Boolean(clip(data.headline, L.headline))
    && Boolean(clip(data.leftBlock?.title, L.blockTitle))
    && Boolean(clip(data.rightBlock?.title, L.blockTitle));
  if (!coreValid) return { ...fallback, source: 'fallback' };

  return {
    seriesLabel: text(data.seriesLabel, L.seriesLabel, fallback.seriesLabel).toUpperCase(),
    dayLabel: text(data.dayLabel, L.dayLabel, fallback.dayLabel).toUpperCase(),
    headline: text(data.headline, L.headline, fallback.headline),
    subheadline: text(data.subheadline, L.subheadline, fallback.subheadline),
    leftBlock: block(data.leftBlock, fallback.leftBlock),
    rightBlock: block(data.rightBlock, fallback.rightBlock),
    useCases: list(data.useCases, L.useCase, L.useCases, fallback.useCases),
    example: {
      input: text(example.input, L.example, fallback.example.input),
      output: text(example.output, L.example, fallback.example.output)
    },
    takeaways: list(data.takeaways, L.takeaway, L.takeaways, fallback.takeaways),
    closingNote: text(data.closingNote, L.closingNote, fallback.closingNote),
    source: 'live'
  };
}

// Shorten at a word boundary and add an ellipsis when over the limit.
function clip(value, max) {
  const text = String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atSpace = cut.lastIndexOf(' ');
  return `${(atSpace > max * 0.5 ? cut.slice(0, atSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

// ---------------------------------------------------------------------------
// Demo Mode: deterministic, category-aware infographicData (no API call).
// ---------------------------------------------------------------------------

export function buildDemoInfographicData({ category = '', quote = '', day = 1, totalDays = 1, variant = 0 } = {}) {
  const categoryName = String(category || '').trim() || 'Daily Growth';
  const frames = framesForCategory(categoryName);
  const frame = frames[(Math.max(0, Number(day) - 1) + Number(variant || 0)) % frames.length];
  const dayNumber = Math.max(1, Number(day) || 1);
  const total = Math.max(dayNumber, Number(totalDays) || 1);

  const base = {
    seriesLabel: `${categoryName} mini series`.toUpperCase(),
    dayLabel: total > 1 ? `DAY ${dayNumber} OF ${total}` : `DAY ${dayNumber}`,
    ...frame,
    // The post's own quote becomes the closing note so card and caption stay connected.
    closingNote: String(quote || '').trim() || frame.closingNote,
    source: 'demo'
  };
  return { ...normalizeInfographicData(base, base), source: 'demo' };
}

function framesForCategory(category) {
  const key = category.toLowerCase();
  if (/psych|mind|worth|emotion|anxiety|overthink|relationship|attachment|boundar|mental|therapy|self.?love/.test(key)) return FRAMES.psychology;
  if (/well|health|fit|holistic|nutrition|sleep|yoga|body|stress|calm/.test(key)) return FRAMES.wellness;
  if (/tech|\bai\b|code|coding|software|engineer|data|digital|program|developer/.test(key)) return FRAMES.technology;
  if (/career|business|leader|entrepreneur|marketing|sales|money|finance|manage|startup|work/.test(key)) return FRAMES.work;
  if (/motivat|growth|confiden|habit|discipline|productiv|success|goal|personal/.test(key)) return FRAMES.growth;
  return genericFrames(category);
}

const FRAMES = {
  psychology: [
    {
      headline: 'Why overthinking feels productive',
      subheadline: 'Your brain may be solving the wrong problem.',
      leftBlock: { title: 'Overthinking', subtitle: 'Feels like preparation', points: ['Repeats possible outcomes', 'Looks for total certainty', 'Creates mental fatigue'] },
      rightBlock: { title: 'Reflection', subtitle: 'Creates useful clarity', points: ['Names the real problem', 'Separates facts from fear', 'Ends with a decision'] },
      useCases: ['Pause', 'Question', 'Reframe', 'Choose'],
      example: { input: 'What if I fail?', output: 'What can I control today?' },
      takeaways: ['Thinking is useful when it creates action.', 'More thinking is not always more clarity.', 'End reflection with one decision.'],
      closingNote: 'Different problems need different kinds of thinking.'
    },
    {
      headline: 'Why people-pleasing feels safe (but isn’t)',
      subheadline: 'Keeping everyone happy can quietly cost you yourself.',
      leftBlock: { title: 'People-pleasing', subtitle: 'Keeps the peace today', points: ['Says yes before thinking', 'Avoids any disappointment', 'Builds quiet resentment'] },
      rightBlock: { title: 'Boundaries', subtitle: 'Protects the relationship', points: ['Pauses before agreeing', 'Says no without over-explaining', 'Keeps respect on both sides'] },
      useCases: ['Work asks', 'Family', 'Friendships', 'Dating'],
      example: { input: 'Can you cover for me again this weekend?', output: 'I can’t this weekend, but I can help on Monday.' },
      takeaways: ['A boundary is information, not an attack.', 'Discomfort now prevents resentment later.', 'Kind and clear can happen together.'],
      closingNote: 'The right people adjust to your boundaries.'
    },
    {
      headline: 'External validation vs. inner self-worth',
      subheadline: 'One needs an audience. The other is already yours.',
      leftBlock: { title: 'Validation', subtitle: 'Borrowed from others', points: ['Rises and falls with feedback', 'Needs constant reassurance', 'Shrinks when ignored'] },
      rightBlock: { title: 'Self-worth', subtitle: 'Built from within', points: ['Stays steady through criticism', 'Grows from promises you keep', 'Lets you disagree calmly'] },
      useCases: ['Social media', 'Feedback', 'Rejection', 'Comparison'],
      example: { input: 'Nobody liked my post.', output: 'Did I share something I believe in?' },
      takeaways: ['Approval feels good but never lasts.', 'Self-worth grows from your own actions.', 'Notice who you are without an audience.'],
      closingNote: 'Your worth was never up for a vote.'
    }
  ],
  wellness: [
    {
      headline: 'Why rest is not laziness',
      subheadline: 'Recovery is part of the work, not a reward for finishing it.',
      leftBlock: { title: 'Hustle mode', subtitle: 'Pushes through fatigue', points: ['Skips meals and breaks', 'Treats sleep as optional', 'Runs on caffeine and stress'] },
      rightBlock: { title: 'Recovery mode', subtitle: 'Refills the tank', points: ['Plans real breaks', 'Protects 7–9 hours of sleep', 'Notices early warning signs'] },
      useCases: ['Sleep', 'Meals', 'Movement', 'Breaks'],
      example: { input: 'I’ll rest when everything is done.', output: 'I’ll rest so I can finish well.' },
      takeaways: ['Rest is part of the work, not a reward.', 'Skipped recovery always comes back later.', 'Small daily pauses beat one big crash.'],
      closingNote: 'A rested body makes better decisions.'
    },
    {
      headline: 'Quick fixes vs. habits that last',
      subheadline: 'Real wellness is built in small, boring, repeatable steps.',
      leftBlock: { title: 'Quick fixes', subtitle: 'Promise fast results', points: ['Extreme rules and restriction', 'Motivation fades in weeks', 'All-or-nothing thinking'] },
      rightBlock: { title: 'Lasting habits', subtitle: 'Compound over time', points: ['Small changes you can repeat', 'Flexible on busy days', 'Progress over perfection'] },
      useCases: ['Nutrition', 'Hydration', 'Walking', 'Sleep'],
      example: { input: 'I’ll overhaul my whole diet on Monday.', output: 'I’ll add one vegetable to lunch today.' },
      takeaways: ['If you can’t repeat it, it won’t last.', 'Consistency beats intensity.', 'Start smaller than feels impressive.'],
      closingNote: 'Tiny habits, repeated daily, change everything.'
    },
    {
      headline: 'Reacting vs. responding to stress',
      subheadline: 'The pause between trigger and action is where calm lives.',
      leftBlock: { title: 'Reacting', subtitle: 'Runs on autopilot', points: ['Shallow, fast breathing', 'Snaps at small things', 'Replays it for hours'] },
      rightBlock: { title: 'Responding', subtitle: 'Chooses the next step', points: ['Takes three slow breaths', 'Names the feeling', 'Acts on what matters'] },
      useCases: ['Breathing', 'Journaling', 'Walking', 'Stretching'],
      example: { input: 'Everything is going wrong today.', output: 'What is one thing I can handle right now?' },
      takeaways: ['You can’t skip stress, but you can shorten it.', 'Breath is the fastest reset you own.', 'Name the feeling to loosen its grip.'],
      closingNote: 'Calm is a skill, not a personality.'
    }
  ],
  growth: [
    {
      headline: 'Motivation vs. discipline',
      subheadline: 'One gets you started. The other gets you through.',
      leftBlock: { title: 'Motivation', subtitle: 'A feeling that comes and goes', points: ['Strong on good days', 'Waits for the right mood', 'Fades after the first week'] },
      rightBlock: { title: 'Discipline', subtitle: 'A system you can rely on', points: ['Shows up on bad days', 'Starts before feeling ready', 'Builds momentum over time'] },
      useCases: ['Workouts', 'Studying', 'Writing', 'Saving'],
      example: { input: 'I don’t feel like doing it today.', output: 'I’ll do the smallest version for 10 minutes.' },
      takeaways: ['Don’t wait to feel ready.', 'Systems beat willpower.', 'Action often creates motivation.'],
      closingNote: 'Discipline is remembering what you want most.'
    },
    {
      headline: 'Fixed mindset vs. growth mindset',
      subheadline: 'How you explain failure shapes what you try next.',
      leftBlock: { title: 'Fixed mindset', subtitle: 'Talent is set in stone', points: ['Avoids hard challenges', 'Sees mistakes as proof', 'Feels threatened by others’ wins'] },
      rightBlock: { title: 'Growth mindset', subtitle: 'Skills can be built', points: ['Leans into challenge', 'Treats mistakes as data', 'Learns from others’ success'] },
      useCases: ['New skills', 'Feedback', 'Setbacks', 'Goals'],
      example: { input: 'I’m just not good at this.', output: 'I’m not good at this yet.' },
      takeaways: ['“Yet” is the most useful word you have.', 'Effort is how ability grows.', 'Feedback is a map, not a verdict.'],
      closingNote: 'You are allowed to be a beginner.'
    },
    {
      headline: 'Why comparison drains your confidence',
      subheadline: 'Measure yourself against who you were, not who they seem to be.',
      leftBlock: { title: 'Comparison', subtitle: 'Someone else’s highlight reel', points: ['Judges your start by their middle', 'Ignores your context', 'Leaves you feeling behind'] },
      rightBlock: { title: 'Self-progress', subtitle: 'Your own honest scoreboard', points: ['Tracks small personal wins', 'Respects your timeline', 'Builds real confidence'] },
      useCases: ['Social media', 'Career', 'Fitness', 'Money'],
      example: { input: 'She’s so far ahead of me.', output: 'What did I improve this month?' },
      takeaways: ['Comparison steals focus from your next step.', 'Your timeline is allowed to be different.', 'Confidence comes from promises you keep.'],
      closingNote: 'The only fair race is with yesterday’s you.'
    }
  ],
  work: [
    {
      headline: 'Busy vs. productive',
      subheadline: 'A full calendar is not the same as meaningful progress.',
      leftBlock: { title: 'Busy', subtitle: 'Feels like progress', points: ['Answers every message instantly', 'Says yes to every meeting', 'Ends the day exhausted'] },
      rightBlock: { title: 'Productive', subtitle: 'Creates real results', points: ['Blocks time for deep work', 'Chooses the top 3 priorities', 'Ends the day with output'] },
      useCases: ['Planning', 'Meetings', 'Email', 'Deep work'],
      example: { input: 'I worked 10 hours but got nothing done.', output: 'What is the one task that moves the needle?' },
      takeaways: ['Activity is not achievement.', 'Protect your best hours for your best work.', 'Pick your top three before opening email.'],
      closingNote: 'Focus is saying no to good things.'
    },
    {
      headline: 'Managing tasks vs. leading people',
      subheadline: 'Great leaders build people who don’t need them for every decision.',
      leftBlock: { title: 'Managing', subtitle: 'Controls the work', points: ['Gives step-by-step instructions', 'Owns every decision', 'Measures only output'] },
      rightBlock: { title: 'Leading', subtitle: 'Grows the team', points: ['Explains the why', 'Delegates real ownership', 'Develops future leaders'] },
      useCases: ['Feedback', 'Delegation', 'Hiring', '1:1s'],
      example: { input: 'Just do it the way I told you.', output: 'Here’s the goal. How would you approach it?' },
      takeaways: ['Context beats control.', 'Delegate outcomes, not just tasks.', 'Your team’s growth is your real output.'],
      closingNote: 'Leadership is measured by who grows around you.'
    },
    {
      headline: 'Selling features vs. solving problems',
      subheadline: 'Customers don’t buy what it is. They buy what it changes.',
      leftBlock: { title: 'Features', subtitle: 'What the product does', points: ['Lists specs and settings', 'Speaks your team’s language', 'Makes buyers do the math'] },
      rightBlock: { title: 'Outcomes', subtitle: 'What the customer gets', points: ['Names the painful problem', 'Speaks the buyer’s language', 'Shows the before and after'] },
      useCases: ['Landing pages', 'Sales calls', 'Emails', 'Pitches'],
      example: { input: 'Our app has 40 integrations.', output: 'Stop copying data between tools by hand.' },
      takeaways: ['Lead with the problem you solve.', 'Benefits sell; features support.', 'Use your customer’s own words.'],
      closingNote: 'People buy better versions of themselves.'
    }
  ],
  technology: [
    {
      headline: 'Using AI vs. thinking with AI',
      subheadline: 'Better results come from better questions, not more prompts.',
      leftBlock: { title: 'Copy-paste AI', subtitle: 'Fast but shallow', points: ['Accepts the first answer', 'Skips checking facts', 'Sounds like everyone else'] },
      rightBlock: { title: 'Thinking partner', subtitle: 'Slower, much smarter', points: ['Gives clear context', 'Challenges weak answers', 'Adds your own judgment'] },
      useCases: ['Research', 'Writing', 'Coding', 'Planning'],
      example: { input: 'Write me a blog post.', output: 'Here’s my audience and angle. Draft an outline.' },
      takeaways: ['AI amplifies the clarity you bring.', 'Always verify important facts.', 'Your judgment is the real advantage.'],
      closingNote: 'Tools change fast. Good thinking lasts.'
    },
    {
      headline: 'Not every AI task needs a chatbot',
      subheadline: 'Sometimes a system should pick an answer, not write one.',
      leftBlock: { title: 'Text generation', subtitle: 'Writes open-ended answers', points: ['Explains and summarizes', 'Handles fuzzy questions', 'Slower for simple choices'] },
      rightBlock: { title: 'Classification', subtitle: 'Returns one clear label', points: ['Sorts and routes requests', 'Scores options quickly', 'Cheap and predictable'] },
      useCases: ['Routing', 'Tagging', 'Scoring', 'Spam checks'],
      example: { input: 'Where is my order?', output: 'Intent: order status → Support team' },
      takeaways: ['Use generation for language and nuance.', 'Use classification for speed and structure.', 'Real products often need both.'],
      closingNote: 'Pick the tool that fits the job, not the hype.'
    },
    {
      headline: 'Watching tutorials vs. building projects',
      subheadline: 'You learn to code by getting stuck, not by watching others.',
      leftBlock: { title: 'Tutorial loop', subtitle: 'Feels like learning', points: ['Follows along step by step', 'Rarely hits real errors', 'Forgets it a week later'] },
      rightBlock: { title: 'Building', subtitle: 'Actually learning', points: ['Starts with a small idea', 'Debugs real problems', 'Remembers what it solved'] },
      useCases: ['Side projects', 'Debugging', 'Docs', 'Code review'],
      example: { input: 'I’ll watch one more course first.', output: 'I’ll build a tiny app this weekend.' },
      takeaways: ['Getting stuck is part of learning.', 'Small shipped projects beat big plans.', 'Read error messages slowly.'],
      closingNote: 'Build first. Polish later.'
    }
  ]
};

function genericFrames(category) {
  const topic = category.toLowerCase();
  return [
    {
      headline: `${category}: habits vs. hype`,
      subheadline: 'Lasting results come from small actions repeated daily.',
      leftBlock: { title: 'Hype', subtitle: 'Big promises, fast', points: ['Chases quick wins', 'Changes plans often', 'Burns out early'] },
      rightBlock: { title: 'Habits', subtitle: 'Small steps, daily', points: ['Picks one clear focus', 'Repeats what works', 'Improves a little each week'] },
      useCases: ['Mornings', 'Planning', 'Practice', 'Review'],
      example: { input: `I’ll master ${topic} this month.`, output: 'I’ll practise for 15 minutes today.' },
      takeaways: ['Consistency beats intensity.', 'Start smaller than you think.', 'Review what worked every week.'],
      closingNote: 'Small steps count more than big plans.'
    },
    {
      headline: `Myths vs. facts about ${topic}`,
      subheadline: 'Clear thinking starts with questioning what everyone repeats.',
      leftBlock: { title: 'Myth', subtitle: 'Sounds true', points: ['Repeated everywhere', 'Based on one story', 'Hard to act on'] },
      rightBlock: { title: 'Fact', subtitle: 'Holds up', points: ['Backed by evidence', 'Works across situations', 'Leads to a clear next step'] },
      useCases: ['Reading', 'Asking', 'Testing', 'Sharing'],
      example: { input: 'Everyone says this works.', output: 'What evidence shows it works for me?' },
      takeaways: ['Popular is not the same as proven.', 'Test ideas on a small scale first.', 'Stay curious and stay open.'],
      closingNote: 'Question the obvious. Keep what’s true.'
    },
    {
      headline: `Beginner vs. expert in ${topic}`,
      subheadline: 'Experts aren’t fearless. They’ve just practised the basics longer.',
      leftBlock: { title: 'Beginner', subtitle: 'Wants every answer first', points: ['Collects more information', 'Fears making mistakes', 'Waits to feel ready'] },
      rightBlock: { title: 'Expert', subtitle: 'Masters the basics', points: ['Practises fundamentals', 'Learns from each mistake', 'Starts before feeling ready'] },
      useCases: ['Learning', 'Practice', 'Feedback', 'Teaching'],
      example: { input: 'I need to know everything first.', output: 'What is one basic I can practise today?' },
      takeaways: ['Fundamentals beat shortcuts.', 'Mistakes are part of mastery.', 'Teach what you learn to keep it.'],
      closingNote: 'Every expert was once a beginner who kept going.'
    }
  ];
}
