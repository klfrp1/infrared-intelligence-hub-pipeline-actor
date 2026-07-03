import axios from 'axios';

/**
 * Direct Discovery Mode for the Infrared Intelligence Hub.
 * Does not call another Apify Actor.
 * Includes fallback seed rows when search result parsing returns zero.
 */
export async function discoverListings(keyword, searchDomain, countryFilter, maxItems) {
    const queryKeyword = keyword || '';
    const domainConstraint = searchDomain || '';
    const country = countryFilter || 'Global';
    const limit = maxItems ?? 5;

    const searchTerms = [];
    if (domainConstraint) searchTerms.push(domainConstraint);
    if (queryKeyword) searchTerms.push(queryKeyword);
    searchTerms.push('infrared patent material research technology');

    const targetQuery = searchTerms.join(' ');
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetQuery)}`;

    console.log(`Starting direct discovery for query: "${targetQuery}" with limit: ${limit}`);

    let assignedCategory = 'Infrared Tech';
    const lowerKeyword = queryKeyword.toLowerCase();
    const lowerDomain = domainConstraint.toLowerCase();

    if (lowerKeyword.includes('patent') || lowerDomain.includes('patent')) {
        assignedCategory = 'Infrared Patents';
    } else if (lowerKeyword.includes('material')) {
        assignedCategory = 'Infrared Materials';
    } else if (lowerKeyword.includes('manufacturer') || lowerKeyword.includes('company')) {
        assignedCategory = 'Infrared Manufacturers';
    } else if (lowerKeyword.includes('research') || lowerKeyword.includes('journal') || lowerKeyword.includes('pubmed')) {
        assignedCategory = 'Infrared Research';
    } else if (lowerKeyword.includes('component') || lowerKeyword.includes('sensor') || lowerKeyword.includes('lens')) {
        assignedCategory = 'Infrared Components';
    } else if (lowerKeyword.includes('near') || lowerKeyword.includes('nir') || lowerKeyword.includes('swir')) {
        assignedCategory = 'Near Infrared Technology';
    } else if (lowerKeyword.includes('mid') || lowerKeyword.includes('mwir')) {
        assignedCategory = 'Mid Infrared Technology';
    } else if (lowerKeyword.includes('far') || lowerKeyword.includes('lwir') || lowerKeyword.includes('fir')) {
        assignedCategory = 'Far Infrared Technology';
    }

    const normalizedRecords = [];
    const seenUrls = new Set();

    try {
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 InfraredIntelligenceHubBot/1.0'
            },
            timeout: 30000
        });

        const html = response.data || '';

        const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
        let match;

        while ((match = resultRegex.exec(html)) !== null && normalizedRecords.length < limit) {
            let extractedUrl = match[1].replace(/&amp;/g, '&').trim();

            if (extractedUrl.includes('uddg=')) {
                const urlMatch = extractedUrl.match(/[?&]uddg=([^&]+)/);
                if (urlMatch && urlMatch[1]) {
                    extractedUrl = decodeURIComponent(urlMatch[1]);
                }
            }

            if (!extractedUrl.startsWith('http://') && !extractedUrl.startsWith('https://')) continue;

            const cleanUrlKey = extractedUrl.replace(/^https?:\/\/(www\.)?/, '').trim().toLowerCase();
            if (seenUrls.has(cleanUrlKey)) continue;
            seenUrls.add(cleanUrlKey);

            const title = match[2]
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&#x27;/g, "'")
                .replace(/&quot;/g, '"')
                .trim();

            normalizedRecords.push(makeRecord({
                title,
                url: extractedUrl,
                snippet: '',
                assignedCategory,
                country,
                domainConstraint,
                queryKeyword
            }));
        }
    } catch (err) {
        console.log(`Direct search fetch warning: ${err.message}`);
    }

    if (normalizedRecords.length === 0) {
        console.log('No parseable search records found. Creating fallback technical review rows.');

        const fallbackRows = [
            {
                title: `${queryKeyword || 'Infrared technology'} technical record`,
                url: domainConstraint && domainConstraint.includes('.')
                    ? `https://${domainConstraint.replace(/^https?:\/\//, '')}`
                    : 'https://patents.google.com',
                snippet: `Manual review seed for ${queryKeyword || 'infrared technology'} from ${domainConstraint || 'general discovery source'}.`
            },
            {
                title: `${queryKeyword || 'Infrared'} patent and application review`,
                url: 'https://patents.google.com',
                snippet: 'Fallback patent discovery row for manual validation and enrichment.'
            },
            {
                title: `${queryKeyword || 'Infrared'} materials and technical specifications review`,
                url: 'https://scholar.google.com',
                snippet: 'Fallback research discovery row for manual validation and enrichment.'
            }
        ];

        for (const item of fallbackRows.slice(0, limit)) {
            normalizedRecords.push(makeRecord({
                title: item.title,
                url: item.url,
                snippet: item.snippet,
                assignedCategory,
                country,
                domainConstraint,
                queryKeyword
            }));
        }
    }

    console.log(`Successfully acquired and normalized ${normalizedRecords.length} technical listings under category "${assignedCategory}".`);
    return normalizedRecords;
}

function makeRecord({ title, url, snippet, assignedCategory, country, domainConstraint, queryKeyword }) {
    return {
        listing_name: title,
        listing_type: 'Technology Record',
        admin_category: assignedCategory,
        country: country,
        website_url: url,
        patent_reference_num: url.includes('patent') ? (url.match(/\d{7,10}/)?.[0] || '') : '',
        operational_status: 'To Verify',
        company_assignee: domainConstraint || '',
        application_area: queryKeyword || '',
        spectral_range: '',
        material_composition: '',
        technical_specifications: snippet || '',
        source_url: url,
        verification_status: 'Unverified',
        keywords: queryKeyword,
        listing_content: '',
        data_freshness: new Date().toISOString().split('T')[0],
        data_source: 'Direct Discovery Mode',
        source_id: `ir-tech-${Math.floor(100000 + Math.random() * 900000)}`,
        post_status: 'draft',
        featured: 0
    };
}
