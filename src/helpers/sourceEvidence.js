import axios from 'axios';

function cleanSourceText(rawText = '') {
  return String(rawText)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchSourceEvidence(row) {
  const sourceUrl = row?.website_url || '';

  if (!sourceUrl) {
    return {
      source_url: '',
      source_text: '',
      source_fetch_status: 'missing_url',
    };
  }

  try {
    const response = await axios.get(sourceUrl, {
      timeout: 15000,
      maxContentLength: 2000000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 Infrared-Intelligence-Hub/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain',
      },
    });

    const raw =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

    const fullText = cleanSourceText(raw);

const evidenceTerms =
  /\b(swir|short[-\s]?wave infrared|ingaas|indium gallium arsenide|focal[-\s]?plane|photodetector|detector array|absorber layer|spectral range)\b/gi;

const priorityEvidenceTerms =
  /\b(?:n-type|p-type)\s+ingaas\s+absorber\s+layer\b|\bingaas[-\s]+based\s+(?:detector|photodetector)\b|\b(?:swir|short[-\s]?wave infrared)\s+fpa\b/gi;

const priorityMatches = [...fullText.matchAll(priorityEvidenceTerms)];
const generalMatches = [...fullText.matchAll(evidenceTerms)];

const matches = [...priorityMatches, ...generalMatches].filter(
  (match, index, all) =>
    all.findIndex((item) => item.index === match.index) === index
);;

let sourceText;

if (matches.length > 0) {
  const snippets = matches.slice(0, 12).map((match) => {
    const start = Math.max(0, match.index - 1000);
    const end = Math.min(fullText.length, match.index + 2000);
    return fullText.slice(start, end);
  });

  sourceText = snippets.join('\n\n--- EVIDENCE SECTION ---\n\n').slice(0, 24000);
} else {
  sourceText = fullText.slice(0, 12000);
}

    return {
      source_url: sourceUrl,
      source_text: sourceText,
      source_fetch_status: sourceText ? 'fetched' : 'empty',
    };
  } catch (error) {
    console.error(
      `Source evidence fetch error on ${sourceUrl}:`,
      error.message
    );

    return {
      source_url: sourceUrl,
      source_text: '',
      source_fetch_status: 'fetch_failed',
    };
  }
}
