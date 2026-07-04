import axios from 'axios';

/**
 * Patent-first discovery for the Infrared Intelligence Hub.
 * 
 * Goal:
 * 1. Try to pull real patent-style records from Google Patents.
 * 2. Normalize them into the hub listing format.
 * 3. If no real records are found, create fallback manual-review rows
 *    so the pipeline still produces a CSV instead of failing.
 */
export async function discoverListings(keyword, searchDomain, countryFilter, maxItems) {
    const queryKeyword = keyword || 'infrared patent';
    const country = countryFilter || 'United States';
    const limit = maxItems ?? 5;

    let assignedCategory = 'Infrared Tech';

    if (/patent|wipo|uspto|espacenet/i.test(queryKeyword)) {
        assignedCategory = 'Infrared Patents';
    } else if (/medical|therapy|health|sauna|wellness/i.test(queryKeyword)) {
        assignedCategory = 'Infrared Health & Wellness';
    } else if (/food|fresh|preservation|agriculture/i.test(queryKeyword)) {
        assignedCategory = 'Infrared Food & Agriculture';
    } else if (/industrial|drying|curing|heating|manufacturing/i.test(queryKeyword)) {
        assignedCategory = 'Infrared Industrial';
    } else if (/sensor|thermal|imaging|camera|swir|mwir|lwir/i.test(queryKeyword)) {
        assignedCategory = 'Infrared Sensors & Imaging';
    }

    const searchQuery = buildPatentQuery(queryKeyword, searchDomain);

    console.log(`Starting Google Patents discovery for query: "${searchQuery}" with limit: ${limit}`);

    let normalizedRecords = [];

    try {
        const patentRows = await fetchGooglePatentRows(searchQuery, limit);

        for (const patent of patentRows.slice(0, limit)) {
            normalizedRecords.push(makePatentRecord(patent, {
                queryKeyword,
                country,
                assignedCategory,
            }));
        }
    } catch (error) {
        console.log(`Google Patents discovery warning: ${error.message}`);
    }

    if (normalizedRecords.length === 0) {
        console.log('No real Google Patents records found. Creating fallback technical review rows.');

        const fallbackRows = [
            {
                title: `${queryKeyword} technical record`,
                url: 'https://patents.google.com',
                snippet: `Manual review seed for ${queryKeyword} from Google Patents discovery source.`,
            },
            {
                title: `${queryKeyword} patent and application review`,
                url: 'https://patents.google.com',
                snippet: 'Fallback patent discovery row for manual validation and enrichment.',
            },
            {
                title: `${queryKeyword} materials and technical specifications review`,
                url: 'https://scholar.google.com',
                snippet: 'Fallback research discovery row for manual validation and enrichment.',
            },
        ];

        for (const item of fallbackRows.slice(0, limit)) {
            normalizedRecords.push(makeFallbackRecord(item, {
                queryKeyword,
                country,
                assignedCategory,
            }));
        }
    }

    console.log(`Successfully acquired and normalized ${normalizedRecords.length} technical listings under category "${assignedCategory}".`);

    return normalizedRecords;
}

function buildPatentQuery(keyword, searchDomain) {
    const parts = [];

    if (keyword) parts.push(keyword);

    if (searchDomain && searchDomain.includes('patents.google.com')) {
        parts.push('site:patents.google.com');
    }

    parts.push('infrared');
    parts.push('far infrared OR thermal OR radiant OR sensor OR material');

    return parts.join(' ');
}

async function fetchGooglePatentRows(searchQuery, limit) {
    const queryUrl = `https://patents.google.com/xhr/query?url=q%3D${encodeURIComponent(searchQuery)}&exp=&tags=`;

    const response = await axios.get(queryUrl, {
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 InfraredIntelligenceHubBot/1.0',
            'Accept': 'application/json,text/plain,*/*',
        },
    });

    const data = response.data;

    const patentRows = [];

    // Main expected Google Patents shape.
    const clusters = data?.results?.cluster || [];

    for (const cluster of clusters) {
        const results = Array.isArray(cluster.result) ? cluster.result : [cluster.result];

        for (const result of results) {
            const patent = result?.patent || result;

            const title =
                cleanText(patent?.title) ||
                cleanText(result?.title) ||
                cleanText(cluster?.title);

            const publicationNumber =
                cleanText(patent?.publication_number) ||
                cleanText(patent?.publicationNumber) ||
                cleanText(result?.publication_number);

            if (!title && !publicationNumber) continue;

            const assignee =
                cleanText(patent?.assignee) ||
                cleanText(result?.assignee) ||
                cleanText(cluster?.assignee);

            const snippet =
                cleanText(patent?.snippet) ||
                cleanText(result?.snippet) ||
                cleanText(cluster?.snippet) ||
                title ||
                'Patent record discovered from Google Patents.';

            const url = publicationNumber
                ? `https://patents.google.com/patent/${publicationNumber}/en`
                : 'https://patents.google.com';

            patentRows.push({
                title,
                publicationNumber,
                assignee,
                snippet,
                url,
                filingDate: cleanText(patent?.filing_date || result?.filing_date),
                publicationDate: cleanText(patent?.publication_date || result?.publication_date),
                status: cleanText(patent?.status || result?.status) || 'To Verify',
            });

            if (patentRows.length >= limit) {
                return patentRows;
            }
        }
    }

    // Backup parser for unexpected response shapes.
    const rawText = JSON.stringify(data);
    const publicationMatches = [...rawText.matchAll(/\b(US|WO|EP|CN|JP|KR|DE|GB)\d{4,}[A-Z]?\d?\b/g)];

    const seen = new Set();

    for (const match of publicationMatches) {
        const publicationNumber = match[0];

        if (seen.has(publicationNumber)) continue;
        seen.add(publicationNumber);

        patentRows.push({
            title: `${searchQuery} patent record ${publicationNumber}`,
            publicationNumber,
            assignee: '',
            snippet: `Patent publication ${publicationNumber} discovered from Google Patents response.`,
            url: `https://patents.google.com/patent/${publicationNumber}/en`,
            filingDate: '',
            publicationDate: '',
            status: 'To Verify',
        });

        if (patentRows.length >= limit) {
            return patentRows;
        }
    }

    return patentRows;
}

function makePatentRecord(patent, context) {
    const { queryKeyword, country, assignedCategory } = context;

    const title = patent.title || `${queryKeyword} patent record`;
    const publicationNumber = patent.publicationNumber || '';

    return {
        listing_name: title,
        listing_type: 'Patent / Technology Record',
        admin_category: assignedCategory,
        country,
        website_url: patent.url || 'https://patents.google.com',
        patent_reference_num: publicationNumber,
        operational_status: patent.status || 'To Verify',
        company_assignee: patent.assignee || 'Unknown / To Verify',
        application_area: queryKeyword,
        spectral_range: inferSpectralRange(title, patent.snippet),
        material_composition: inferMaterial(title, patent.snippet),
        technical_specifications: patent.snippet || 'Patent record discovered from Google Patents.',
        source_url: patent.url || 'https://patents.google.com',
        verification_status: 'Needs Review',
        keywords: queryKeyword,
        listing_content: `<p>${escapeHtml(patent.snippet || title)}</p>`,
        data_freshness: new Date().toISOString().slice(0, 10),
        data_source: 'Google Patents Direct Discovery',
        source_id: publicationNumber || `ir-patent-${Math.floor(Math.random() * 1000000)}`,
        post_status: 'draft',
        featured: 0,

        qa_1_answer: patent.assignee || 'Unknown / To Verify',
        qa_2_answer: publicationNumber || 'Unknown / To Verify',
        qa_3_answer: `${assignedCategory}; Spectral range: ${inferSpectralRange(title, patent.snippet)}`,
        qa_4_answer: inferMaterial(title, patent.snippet),
        qa_5_answer: patent.url || 'https://patents.google.com',
        qa_6_answer: patent.publicationDate || patent.filingDate || 'Unknown / To Verify',
        qa_7_answer: patent.status || 'To Verify',
    };
}

function makeFallbackRecord(item, context) {
    const { queryKeyword, country, assignedCategory } = context;

    return {
        listing_name: item.title,
        listing_type: 'Technology Record',
        admin_category: assignedCategory,
        country,
        website_url: item.url,
        patent_reference_num: '',
        operational_status: 'To Verify',
        company_assignee: '',
        application_area: queryKeyword,
        spectral_range: 'Unknown / To Verify',
        material_composition: 'Unknown / To Verify',
        technical_specifications: item.snippet,
        source_url: item.url,
        verification_status: 'Unverified',
        keywords: queryKeyword,
        listing_content: `<p>${escapeHtml(item.snippet)}</p>`,
        data_freshness: new Date().toISOString().slice(0, 10),
        data_source: 'Fallback Discovery Mode',
        source_id: `ir-tech-${Math.floor(Math.random() * 1000000)}`,
        post_status: 'draft',
        featured: 0,

        qa_1_answer: 'Unknown / To Verify',
        qa_2_answer: 'Unknown / To Verify',
        qa_3_answer: `${assignedCategory}; Spectral range: Unknown / To Verify`,
        qa_4_answer: 'Unknown / To Verify',
        qa_5_answer: item.url,
        qa_6_answer: 'Unknown / To Verify',
        qa_7_answer: 'Unknown / To Verify',
    };
}

function inferSpectralRange(title = '', snippet = '') {
    const text = `${title} ${snippet}`.toLowerCase();

    if (text.includes('far infrared') || text.includes('fir')) return 'Far Infrared / FIR';
    if (text.includes('near infrared') || text.includes('nir')) return 'Near Infrared / NIR';
    if (text.includes('short wave infrared') || text.includes('swir')) return 'Short-Wave Infrared / SWIR';
    if (text.includes('mid wave infrared') || text.includes('mwir')) return 'Mid-Wave Infrared / MWIR';
    if (text.includes('long wave infrared') || text.includes('lwir')) return 'Long-Wave Infrared / LWIR';
    if (text.includes('thermal')) return 'Thermal Infrared';
    if (text.includes('infrared')) return 'Infrared / To Classify';

    return 'Unknown / To Verify';
}

function inferMaterial(title = '', snippet = '') {
    const text = `${title} ${snippet}`.toLowerCase();

    if (text.includes('ceramic')) return 'Ceramic / Infrared-emitting material';
    if (text.includes('graphene')) return 'Graphene-based material';
    if (text.includes('carbon')) return 'Carbon-based material';
    if (text.includes('quartz')) return 'Quartz / Heating element material';
    if (text.includes('semiconductor')) return 'Semiconductor material';
    if (text.includes('ingaas')) return 'InGaAs / Infrared sensor material';
    if (text.includes('germanium')) return 'Germanium / Infrared optical material';
    if (text.includes('silicon')) return 'Silicon-based material';

    return 'Unknown / To Verify';
}

function cleanText(value) {
    if (!value) return '';

    if (Array.isArray(value)) {
        return value.map(cleanText).filter(Boolean).join('; ');
    }

    if (typeof value === 'object') {
        if (value.text) return cleanText(value.text);
        if (value.name) return cleanText(value.name);
        return '';
    }

    return String(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
