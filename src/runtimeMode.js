function envFlag(name) {
  return String(process.env[name] || '').trim().toLowerCase();
}

export function isDemoMode() {
  if (envFlag('DEMO_MODE') === 'true') return true;

  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasXai = Boolean(process.env.XAI_API_KEY);
  const hasInstagram = Boolean(
    process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_USER_ID
  );

  // When no credentials are configured, always keep the existing demo working,
  // even if DEMO_MODE was accidentally left blank or set to false.
  return !hasOpenAI && !hasXai && !hasInstagram;
}

export function useDemoContent() {
  return isDemoMode() || !process.env.OPENAI_API_KEY;
}

export function useDemoImages() {
  return isDemoMode() || !process.env.XAI_API_KEY;
}

export function useDemoPublishing() {
  return isDemoMode() || !(
    process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_USER_ID
  );
}

export function getRuntimeModes() {
  return {
    appMode: isDemoMode() ? 'demo' : 'live',
    contentMode: useDemoContent() ? 'demo' : 'live',
    imageMode: useDemoImages() ? 'demo' : 'live',
    publishingMode: useDemoPublishing() ? 'demo' : 'live'
  };
}
