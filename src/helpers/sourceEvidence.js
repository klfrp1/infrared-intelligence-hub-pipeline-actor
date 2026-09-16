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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error) {
  return (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    /timeout/i.test(String(error?.message || ''))
  );
}

export async function fetchSourceEvidence(row) {
  const sourceUrl = row?.website_url || '';

  if (!sourceUrl) {
    return {
      source_url: '',
      source_text: '',
      source_fetch_status: 'missing_url',
      source_fetch_attempts: 0,
    };
  }

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(sourceUrl, {
        timeout: 20000,
        maxContentLength: 2000000,
        headers: {
          'User-Agent': 'Mozilla/5.0 Infrared-Intelligence-Hub/1.0',
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
        /\b(?:n-type|p-type)\s+ingaas\s+absorber\s+layer\b|\bingaas[-\s]+based\s+(?:detector|photodetector)\b|\b(?:swir|short[-\s]?wave infrared)\s+fpa\b|\bcan(?:\s+also)?\s+be\s+implemented\s+as\b[^.!?]{0,160}\b(?:swir|short[-\s]?wave infrared)\b[^.!?]{0,80}\b(?:ingaas|indium gallium arsenide)\b/gi;

      const priorityMatches = [...fullText.matchAll(priorityEvidenceTerms)];
      const generalMatches = [...fullText.matchAll(evidenceTerms)];

      const matches = [...priorityMatches, ...generalMatches].filter(
        (match, index, all) =>
          all.findIndex((item) => item.index === match.index) === index
      );

      const headerText = fullText.slice(0, 6000);
      let sourceText;

      if (matches.length > 0) {
        const snippets = matches.slice(0, 12).map((match) => {
          const start = Math.max(0, match.index - 1000);
          const end = Math.min(fullText.length, match.index + 2000);
          return fullText.slice(start, end);
        });

        const technicalEvidence = snippets
          .join('\n\n--- EVIDENCE SECTION ---\n\n')
          .slice(0, 18000);

        sourceText = [
          '--- PATENT HEADER / METADATA ---',
          headerText,
          '--- TECHNICAL EVIDENCE ---',
          technicalEvidence,
        ]
          .join('\n\n')
          .slice(0, 24000);
      } else {
        sourceText = fullText.slice(0, 24000);
      }

      return {
        source_url: sourceUrl,
        source_text: sourceText,
        source_fetch_status: sourceText ? 'fetched' : 'empty',
        source_fetch_attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      console.error(
        `Source evidence fetch attempt ${attempt}/${maxAttempts} failed on ${sourceUrl}:`,
        error.message
      );

      if (attempt < maxAttempts) {
        await sleep(750 * attempt);
      }
    }
  }

  return {
    source_url: sourceUrl,
    source_text: '',
    source_fetch_status: isTimeoutError(lastError) ? 'timeout' : 'fetch_failed',
    source_fetch_attempts: maxAttempts,
  };
}
