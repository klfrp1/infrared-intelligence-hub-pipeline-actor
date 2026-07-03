import axios from 'axios';

/**
 * Direct Discovery Mode for the Infrared Intelligence Hub.
 * This version does not call another Apify Actor, so it avoids limited-permission errors.
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

    const response = await axios.get(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 InfraredIntelligenceHubBot/1.0'
        },
        timeout: 30000
    });

    const html = response.data || '';
    const resultBlocks = html.split('result__body').slice(1);

    const normalizedRecords = [];
    const seenUrls = new Set();

    for (const block of resultBlocks) {
        const titleMatch = block.match(/result__a[^>]*>(.*?)<\/a>/is);
        const hrefMatch = block.match(/result__a[^>]*href="([^"]+)"/is);
        const snippetMatch = block.match(/result__snippet[^>]*>(.*?)<\/a>|result__snippet[^>]*>(.*?)<\/div>/is);

        if (!titleMatch || !hrefMatch) continue;

        const title = titleMatch[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .trim();

        let extractedUrl = hrefMatch[1]
            .replace(/&amp;/g, '&')
            .trim();

        if (extractedUrl.includes('uddg=')) {
            const match = extractedUrl.match(/[?&]uddg=([^&]+)/);
            if (match && match[1]) {
                extractedUrl = decodeURIComponent(match[1]);
            }
        }

        if (!extractedUrl.startsWith('http://') && !extractedUrl.startsWith('https://')) {
            continue;
        }

        const cleanUrlKey = extractedUrl.replace(/^https?:\/\/(www\.)?/, '').trim().toLowerCase();
        if (seenUrls.has(cleanUrlKey)) continue;
        seenUrls.add(cleanUrlKey);

        let snippet = '';
        if (snippetMatch) {
            snippet = (snippetMatch[1] || snippetMatch[2] || '')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&#x27;/g, "'")
                .replace(/&quot;/g, '"')
                .trim();
        }

        normalizedRecords.push({
            listing_name: title,
            listing_type: 'Technology Record',
            admin_category: assignedCategory,
            country: country,
            website_url: extractedUrl,
            patent_reference_num: extractedUrl.includes('patent') ? (extractedUrl.match(/\d{7,10}/)?.[0] || '') : '',
            operational_status: 'To Verify',
            company_assignee: domainConstraint || '',
            application_area: queryKeyword || '',
            spectral_range: '',
            material_composition: '',
            technical_specifications: snippet,
            source_url: extractedUrl,
            verification_status: 'Unverified',
            keywords: queryKeyword,
            listing_content: '',
            data_freshness: new Date().toISOString().split('T')[0],
            data_source: 'Direct Discovery Mode',
            source_id: `ir-tech-${Math.floor(100000 + Math.random() * 900000)}`,
            post_status: 'draft',
            featured: 0
        });

        if (normalizedRecords.length >= limit) break;
    }

    console.log(`Successfully acquired and normalized ${normalizedRecords.length} technical listings under category "${assignedCategory}".`);
    return normalizedRecords;
}
