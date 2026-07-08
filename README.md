# AI Instagram Scheduler

Create a 30-day quote schedule, generate captions with OpenAI, optionally generate or animate media with xAI/Grok Imagine, and publish due posts to Instagram through the Instagram Graph API.

## Quick start

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5177`.

The app works without API keys in demo mode. Add keys to `.env` when you want real generation and publishing.

## Run in your browser

After `npm run dev`, open this in Chrome, Edge, or any browser:

```text
http://localhost:5177
```

If you want to open it from another device on the same Wi-Fi, use your computer's local IP address and keep the server running:

```text
http://YOUR_LOCAL_IP:5177
```

## Host it online

Render or Railway are the simplest options for this project because it is a Node/Express web app with a `start` script.

### Recommended: Render

1. Push this folder to a private GitHub repository.
2. In Render, create a new Web Service from that repository.
3. Use these settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Runtime: Node
4. Add environment variables in the Render dashboard:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL=gpt-4.1-mini`
   - `PUBLIC_BASE_URL=https://your-render-url.onrender.com`
   - `XAI_API_KEY` if using Grok media
   - `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_IG_USER_ID` if publishing
   - `SCHEDULER_TIMEZONE=Asia/Kolkata`
5. Deploy, then open the Render URL in your browser.

Render's docs describe creating a Web Service from GitHub and configuring web services here: https://render.com/docs/web-services

### Alternative: Railway

1. Push this folder to a private GitHub repository.
2. Create a Railway project from the repository.
3. Add the same environment variables in the service's Variables tab.
4. Deploy and open the generated Railway URL.

Railway's docs describe service variables here: https://docs.railway.com/variables

### Production note

This version stores schedules in `data/posts.json` and uploaded/generated files on local disk. On many hosts, local disk can reset during redeploys unless you configure persistent storage. For a real production version, move posts to a database and uploads/generated images to object storage such as S3, Cloudinary, or a provider volume.

## What it does

- Builds a dynamic schedule for any number of days.
- Uses OpenAI to generate a quote, caption, and hashtags for your category.
- Uploads a portrait or brand image and renders branded quote-card SVGs.
- Adds creator name and Instagram handle to each post graphic.
- Downloads one post at a time or all posts as a ZIP with caption text files.
- Optionally uses xAI/Grok Imagine for image generation or image-to-video animation.
- Publishes daily when a scheduled post is due.
- Keeps local state in `data/posts.json` and generated media in `public/generated`.

## Instagram setup notes

Instagram publishing uses Meta's content publishing flow: create a media container, wait for it to finish processing, then publish the container. Your Instagram account must be a professional account connected to a Facebook Page, and your app/token must have the required Instagram publishing permissions.

Local preview SVGs are for planning and review. Instagram Graph expects publicly reachable image/video media such as a JPG/PNG/MP4 URL, so for production publishing use the Grok-hosted/generated media URL returned by xAI or replace the renderer with a PNG/JPG renderer on Node 18.17+.

## API references used

- OpenAI Responses API and model docs: https://developers.openai.com/api/docs
- xAI Grok Imagine image/video docs: https://docs.x.ai/developers/model-capabilities/imagine
- Meta Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
