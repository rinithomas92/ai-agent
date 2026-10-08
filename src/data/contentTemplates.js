// Content templates are separate from visual themes (src/data/themes.js).
// For now every template still uses the existing renderer; the ID is stored
// on each post so dedicated renderers can be added later.
export const contentTemplates = {
  premium_quote_dark: { name: 'Premium Psychology Quote' },
  vintage_editorial: { name: 'Vintage Editorial' },
  educational_infographic: { name: 'Educational Infographic' }
};

export const CONTENT_TEMPLATE_IDS = Object.keys(contentTemplates);
export const DEFAULT_TEMPLATE_ID = 'premium_quote_dark';

export function normalizeTemplateId(value) {
  return CONTENT_TEMPLATE_IDS.includes(value) ? value : DEFAULT_TEMPLATE_ID;
}
