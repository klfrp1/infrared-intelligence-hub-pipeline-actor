import { Actor } from 'apify';

export async function discoverListings(keyword, searchDomain, countryFilter, maxItems) {
    const queryKeyword = keyword || '';
    const domainConstraint = searchDomain || '';
    const country = countryFilter || 'Global';
    const limit = maxItems ?? 20;

    const searchTerms = [];
    if (domainConstraint) searchTerms.push(`site:${domainConstraint} ${domainConstraint}`);
    if (queryKeyword) searchTerms.push(queryKeyword);
    searchTerms.push('infrared patent material research technology');
    const targetQuery = searchTerms.join(' ');

    let assignedCategory = 'Far Infrared Technology';
    const lowerKeyword = queryKeyword.toLowerCase();
    const lowerDomain = domainConstraint.toLowerCase();
    if (lowerKeyword.includes('patent') || lowerDomain.includes('patent')) assignedCategory = 'Infrared Patents';
    else if (lowerKeyword.includes('material')) assignedCategory = 'Infrared Materials';
    else if (lowerKeyword.includes('manufacturer') || lowerKeyword.includes('company')) assignedCategory = 'Infrared Manufacturers';
    else if (lowerKeyword.includes('research') || lowerKeyword.includes('journal') || lowerKeyword.includes('pubmed')) assignedCategory = 'Infrared Research';
    else if (lowerKeyword.includes('application') || lowerKeyword.includes('industrial')) assignedCategory = 'Industrial Applications';
    else if (lowerKeyword.includes('component') || lowerKeyword.includes('sensor') || lowerKeyword.includes('lens')) assignedCategory = 'Infrared Components';
    else if (lowerKeyword.includes('near') || lowerKeyword.includes('nir') || lowerKeyword.includes('swir')) assignedCategory = 'Near Infrared Technology';
    else if (lowerKeyword.includes('mid') || lowerKeyword.includes('mwir')) assignedCategory = 'Mid Infrared Technology';
    else if (lowerKeyword.includes('far') || lowerKeyword.includes('lwir') || lowerKeyword.includes('fir')) assignedCategory = 'Far Infrared Technology';

    console.log(`Starting discovery for query: ${targetQuery}`);

    const run = await Actor.call('apify/web-scraper', {
        startUrls: [{ url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetQuery)}` }],
        useLightningHtmlParser: true,
        maxPagesPerCrawl: Math.ceil(limit / 5) || 5,
        pageFunction: `async function pageFunction(context) {
            const $ = context.jQuery;
            const results = [];
            $('.result__body').each((i, el) => {
                const title = $(el).find('.result__title').text().trim();
                const rawUrl = $(el).find('.result__title a').attr('href') || $(el).find('.result__url').attr('href') || $(el).find('.result__url').text().trim();
                const snippet = $(el).find('.result__snippet').text().trim();
                if (title && rawUrl) results.push({ title, url: rawUrl, snippet });
            });
            return results;
        }`
    });

    const { items: datasetItems } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
    const normalizedRecords = [];
    const seenUrls = new Set();

    for (const rawEntry of datasetItems) {
        const entryBlock = Array.isArray(rawEntry) ? rawEntry : (rawEntry.pageFunctionResult || [rawEntry]);
        if (!Array.isArray(entryBlock)) continue;
        for (const item of entryBlock) {
            if (!item || !item.title || !item.url) continue;
            let extractedUrl = item.url.trim();
            if (extractedUrl.includes('uddg=')) {
                const m = extractedUrl.match(/[?&]uddg=([^&]+)/);
                if (m && m[1]) extractedUrl = decodeURIComponent(m[1]);
            }
            if (!extractedUrl.startsWith('http://') && !extractedUrl.startsWith('https://')) continue;
            const cleanUrlKey = extractedUrl.replace(/^https?:\/\/(www\.)?/, '').trim().toLowerCase();
            if (seenUrls.has(cleanUrlKey)) continue;
            seenUrls.add(cleanUrlKey);

            normalizedRecords.push({
                listing_name: item.title.replace(/[\r\n]+/g, ' ').trim(),
                listing_type: 'Technology Record',
                admin_category: assignedCategory,
                country,
                website_url: extractedUrl,
                patent_reference_num: extractedUrl.includes('patent') && extractedUrl.match(/\d{7,10}/) ? extractedUrl.match(/\d{7,10}/)[0] : '',
                operational_status: 'To Verify',
                company_assignee: domainConstraint || '',
                application_area: queryKeyword || '',
                spectral_range: '',
                material_composition: '',
                technical_specifications: item.snippet ? item.snippet.replace(/[\r\n]+/g, ' ').trim() : '',
                source_url: extractedUrl,
                verification_status: 'Unverified',
                keywords: queryKeyword,
                listing_content: '',
                data_freshness: new Date().toISOString().split('T')[0],
                data_source: 'Discovery Mode',
                source_id: `ir-tech-${Math.floor(100000 + Math.random() * 900000)}`,
                post_status: 'draft',
                featured: 0
            });
            if (normalizedRecords.length >= limit) break;
        }
        if (normalizedRecords.length >= limit) break;
    }
    return normalizedRecords;
}
