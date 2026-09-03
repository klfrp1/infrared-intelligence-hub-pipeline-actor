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

    const sourceText = cleanSourceText(raw).slice(0, 12000);

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
