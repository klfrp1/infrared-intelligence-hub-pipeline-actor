import { Actor } from 'apify';
import { parse } from 'csv-parse/sync';
import axios from 'axios';
import { discoverListings } from './helpers/discover.js';
import { enrichWithGooglePlaces, enrichWithOpenAI } from './helpers/enrich.js';
import { passesPublishGate } from './helpers/validate.js';
import { buildOutputRow } from './transform.js';

await Actor.init();

const input = await Actor.getInput();
const { sourceMode, keyword, searchDomain, countryFilter, maxItems, openaiApiKey, outputKvKey, kvStoreId, inputKvKey } = input || {};
const phase = input.phase ?? 1;
const batchSize = input.batchSize ?? 100;
const startRow = input.startRow ?? 0;

const selectedQuestions = [
    'What is the current status of this technology, patent, material, or research record?',
    'Who owns, developed, manufactured, or is assigned to this technology or patent?',
    'What is the primary infrared technology category and spectral range?',
    'What are the main application areas, industries, or use cases?',
    'What source confirms this record, such as Google Patents, USPTO, WIPO, Espacenet, PubMed, manufacturer website, or research source?',
    'What are the verified technical details, material composition, or operational limits?',
    'What makes this technology useful, different, or commercially relevant compared with alternatives?'
];

function convertToCSV(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];
    for (const row of rows) {
        const values = headers.map(header => {
            const cellValue = row[header] === undefined || row[header] === null ? '' : String(row[header]);
            const escaped = cellValue.replace(/"/g, '""');
            return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        });
        csvLines.push(values.join(','));
    }
    return csvLines.join('\n');
}

let rawRows = [];
if (sourceMode === 'seed') {
    if (!kvStoreId) throw new Error("Missing required 'kvStoreId' for seed mode.");
    const storeToken = process.env.APIFY_TOKEN;
    const csvUrl = `https://api.apify.com/v2/key-value-stores/${kvStoreId}/records/${inputKvKey}?token=${storeToken}`;
    const response = await axios.get(csvUrl, { responseType: 'text' });
    const parsedRecords = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
    const workingSet = phase === 2 ? parsedRecords.filter(r => r.post_status === 'publish') : parsedRecords;
    rawRows = workingSet.slice(startRow, startRow + batchSize);
} else {
    rawRows = await discoverListings(keyword, searchDomain, countryFilter, maxItems);
}

const processedPublishRows = [];
const processedPendingRows = [];

for (const baselineRow of rawRows) {
    console.log(`Processing: ${baselineRow.listing_name}`);
    const placesData = await enrichWithGooglePlaces(baselineRow, null, phase);
    const openaiData = await enrichWithOpenAI(baselineRow, openaiApiKey, phase, selectedQuestions);
    const tabularOutput = buildOutputRow(baselineRow, placesData, openaiData, phase);
    const gateResult = passesPublishGate(tabularOutput, phase, selectedQuestions.length);
    tabularOutput.post_status = 'draft';
    tabularOutput.verification_status = gateResult.passes ? 'Review Passed' : 'Unverified';
    if (gateResult.passes) processedPublishRows.push(tabularOutput);
    else processedPendingRows.push(tabularOutput);
}

const targetStoreKey = outputKvKey || 'infrared-intelligence-hub_enriched.csv';
const pendingStoreKey = 'infrared-intelligence-hub_pending.csv';

if (processedPublishRows.length > 0) await Actor.setValue(targetStoreKey, convertToCSV(processedPublishRows), { contentType: 'text/csv' });
if (processedPendingRows.length > 0) await Actor.setValue(pendingStoreKey, convertToCSV(processedPendingRows), { contentType: 'text/csv' });

console.log(`Done. Review Passed: ${processedPublishRows.length}. Pending: ${processedPendingRows.length}.`);
await Actor.exit();
