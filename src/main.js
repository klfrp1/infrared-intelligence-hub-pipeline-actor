import { Actor } from 'apify';
import { parse } from 'csv-parse/sync';
import axios from 'axios';
import { discoverListings } from './helpers/discover.js';
import { enrichWithGooglePlaces, enrichWithOpenAI } from './helpers/enrich.js';
import { fetchSourceEvidence } from './helpers/sourceEvidence.js';
import { passesPublishGate } from './helpers/validate.js';
import {
    canonicalPatentKey,
    isSuspiciousPublicationNumber,
    normalizePublicationNumber,
} from './helpers/patentId.js';

import { buildOutputRow } from './transform.js';

await Actor.init();

const input = await Actor.getInput();
const {
    sourceMode,
    keyword,
    searchDomain,
    countryFilter,
    maxItems,
    openaiApiKey,
    outputKvKey,
    kvStoreId,
    inputKvKey,
    historyStoreName,
    historyKey,
} = input || {};

const phase = input?.phase ?? 1;
const batchSize = input?.batchSize ?? 100;
const startRow = input?.startRow ?? 0;

const selectedQuestions = [
    'What is the current status of this technology, patent, material, or research record?',
    'Who owns, developed, manufactured, or is assigned to this technology or patent?',
    'What is the primary infrared technology category and spectral range?',
    'What are the main application areas, industries, or use cases?',
    'What source confirms this record, such as Google Patents, USPTO, WIPO, Espacenet, PubMed, manufacturer website, or research source?',
    'What are the verified technical details, material composition, or operational limits?',
    'What makes this technology useful, different, or commercially relevant compared with alternatives?',
];

function convertToCSV(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];

    for (const row of rows) {
        const values = headers.map((header) => {
            const cellValue = row[header] === undefined || row[header] === null
                ? ''
                : String(row[header]);
            const escaped = cellValue.replace(/"/g, '""');
            return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        });
        csvLines.push(values.join(','));
    }

    return csvLines.join('\n');
}

function patentKeyForRow(row) {
    const candidate = row?.patent_reference_num || row?.source_id || '';
    const normalized = normalizePublicationNumber(candidate);

    if (!normalized || isSuspiciousPublicationNumber(normalized)) return '';
    return canonicalPatentKey(normalized) || '';
}

const persistentStoreName = historyStoreName || 'infrared-intelligence-hub-data';
const persistentHistoryKey = historyKey || 'infrared-intelligence-hub_processed-history';

let historyStore = null;
let history = {
    version: 1,
    updated_at: null,
    passed_records: {},
};

try {
    historyStore = await Actor.openKeyValueStore(persistentStoreName);
    const storedHistory = await historyStore.getValue(persistentHistoryKey);

    if (storedHistory && typeof storedHistory === 'object') {
        history = {
            version: storedHistory.version || 1,
            updated_at: storedHistory.updated_at || null,
            passed_records: storedHistory.passed_records || {},
        };
    }

    console.log(
        `Loaded ${Object.keys(history.passed_records).length} previously Review Passed patent key(s) from persistent history.`
    );
} catch (error) {
    console.log(`Persistent history warning: ${error.message}`);
}

let rawRows = [];

if (sourceMode === 'seed') {
    if (!kvStoreId) throw new Error("Missing required 'kvStoreId' for seed mode.");

    const storeToken = process.env.APIFY_TOKEN;
    const csvUrl = `https://api.apify.com/v2/key-value-stores/${kvStoreId}/records/${inputKvKey}?token=${storeToken}`;
    const response = await axios.get(csvUrl, { responseType: 'text' });
    const parsedRecords = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    const workingSet = phase === 2
        ? parsedRecords.filter((row) => row.post_status === 'publish')
        : parsedRecords;
    rawRows = workingSet.slice(startRow, startRow + batchSize);
} else {
    rawRows = await discoverListings(
        keyword,
        searchDomain,
        countryFilter,
        maxItems,
        startRow
    );
}

const rowsToProcess = [];
let skippedPreviouslyPassed = 0;

for (const row of rawRows) {
    const patentKey = patentKeyForRow(row);

    if (patentKey && history.passed_records[patentKey]) {
        skippedPreviouslyPassed += 1;
        console.log(
            `Skipping previously Review Passed patent ${row.patent_reference_num || row.source_id || patentKey}.`
        );
        continue;
    }

    rowsToProcess.push(row);
}

const processedPublishRows = [];
const processedPendingRows = [];
let historyChanged = false;

for (const baselineRow of rowsToProcess) {
    console.log(`Processing: ${baselineRow.listing_name}`);

    const placesData = await enrichWithGooglePlaces(baselineRow, null, phase);
    const sourceEvidence = await fetchSourceEvidence(baselineRow);
    const evidenceRow = { ...baselineRow, ...sourceEvidence };
    const openaiData = await enrichWithOpenAI(
        evidenceRow,
        openaiApiKey,
        phase,
        selectedQuestions
    );

    const tabularOutput = buildOutputRow(
        baselineRow,
        placesData,
        openaiData,
        phase,
        selectedQuestions.length
    );

    const gateInput = {
        ...tabularOutput,
        source_text: sourceEvidence.source_text || '',
        source_fetch_status: sourceEvidence.source_fetch_status || '',
    };

    const gateResult = passesPublishGate(
        gateInput,
        phase,
        selectedQuestions.length
    );

    console.log(
        `Gate result for ${baselineRow.patent_reference_num || baselineRow.listing_name}:`,
        gateResult.passes ? 'PASS' : gateResult.reason_codes
    );

    tabularOutput.post_status = 'draft';
    tabularOutput.verification_status = gateResult.passes ? 'Review Passed' : 'Unverified';
    tabularOutput.source_fetch_status = sourceEvidence.source_fetch_status || '';
    tabularOutput.source_fetch_attempts = sourceEvidence.source_fetch_attempts ?? '';
    tabularOutput.pending_reason_codes = gateResult.passes
        ? ''
        : gateResult.reason_codes.join(' | ');
    tabularOutput.pending_reasons = gateResult.passes
        ? ''
        : gateResult.failures.join(' | ');

    if (gateResult.passes) {
        processedPublishRows.push(tabularOutput);

        const patentKey = patentKeyForRow(tabularOutput);
        if (patentKey) {
            const now = new Date().toISOString();
            const prior = history.passed_records[patentKey] || {};

            history.passed_records[patentKey] = {
                patent_reference_num: tabularOutput.patent_reference_num || prior.patent_reference_num || '',
                listing_name: tabularOutput.listing_name || prior.listing_name || '',
                first_passed_at: prior.first_passed_at || now,
                last_passed_at: now,
            };
            historyChanged = true;
        }
    } else {
        processedPendingRows.push(tabularOutput);
    }
}

const targetStoreKey = outputKvKey || 'infrared-intelligence-hub_enriched.csv';
const pendingStoreKey = 'infrared-intelligence-hub_pending.csv';

if (processedPublishRows.length > 0) {
    await Actor.setValue(
        targetStoreKey,
        convertToCSV(processedPublishRows),
        { contentType: 'text/csv' }
    );
}

if (processedPendingRows.length > 0) {
    await Actor.setValue(
        pendingStoreKey,
        convertToCSV(processedPendingRows),
        { contentType: 'text/csv' }
    );
}

if (historyStore && historyChanged) {
    history.updated_at = new Date().toISOString();
    await historyStore.setValue(persistentHistoryKey, history);
    console.log(
        `Persistent history updated: ${Object.keys(history.passed_records).length} Review Passed patent key(s).`
    );
}

console.log(
    `Done. Review Passed: ${processedPublishRows.length}. Pending: ${processedPendingRows.length}. Skipped previously passed: ${skippedPreviouslyPassed}.`
);

await Actor.exit();
