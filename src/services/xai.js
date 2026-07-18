import OpenAI from 'openai';
import { useDemoImages } from '../runtimeMode.js';

export async function generateGrokImage(post) {
  if (useDemoImages()) {
    return { url: post.imageUrl || 'http://localhost:5177/generated/demo.svg', demo: true };
  }


  const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
  });

  const prompt = [
    'Create an elegant vertical Instagram quote post background.',
    `Theme: ${post.category}. Tone: ${post.tone}.`,
    post.creativePrompt ? `Creative brief: ${post.creativePrompt}.` : '',
    post.backgroundDescription ? `Background direction: ${post.backgroundDescription}.` : '',
    `Quote mood: "${post.quote}".`,
    'No readable text in the image, premium wellness brand aesthetic, 4:5 portrait.'
  ].join(' ');

  const response = await client.images.generate({
    model: process.env.XAI_IMAGE_MODEL || 'grok-imagine-image-quality',
    prompt,
    aspect_ratio: '4:5',
    resolution: '1k'
  });

  return { url: response.data[0].url };
}

export async function animateWithGrok(post) {
  if (useDemoImages()) {
    return { url: post.imageUrl || 'http://localhost:5177/generated/demo.svg', demo: true };
  }


  const imageUrl = post.grokImageUrl || post.imageUrl;
  const response = await fetch('https://api.x.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.XAI_VIDEO_MODEL || 'grok-imagine-video-1.5',
      prompt: `Animate this ${post.category} quote card with subtle light movement and calm cinematic pacing.`,
      image: { url: imageUrl },
      duration: 6
    })
  });

  if (!response.ok) {
    throw new Error(`xAI animation failed: ${response.status} ${await response.text()}`);
  }

  const request = await response.json();
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const poll = await fetch(`https://api.x.ai/v1/videos/${request.request_id}`, {
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` }
    });
    const data = await poll.json();
    if (data.status === 'done') return { url: data.video.url };
    if (['failed', 'expired'].includes(data.status)) {
      throw new Error(`xAI animation ${data.status}`);
    }
  }

  throw new Error('xAI animation timed out');
}
