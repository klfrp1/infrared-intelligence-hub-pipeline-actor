import {
    isSuspiciousPublicationNumber,
    normalizePublicationNumber,
} from './patentId.js';

export function passesPublishGate(row, phase, selectedCount) {
    const targetRow = row || {};
    const detectedQaNumbers = Object.keys(targetRow)
        .map((key) => key.match(/^qa_(\d+)_answer$/)?.[1])
        .filter(Boolean)
        .map(Number);
    const detectedQaCount = detectedQaNumbers.length > 0 ? Math.max(...detectedQaNumbers) : 0;
    const totalQAs = Number.isInteger(selectedCount) ? selectedCount : detectedQaCount;

    const failures = [];
    const reasonCodes = [];

    const addFailure = (message, code) => {
        failures.push(message);
        if (code && !reasonCodes.includes(code)) reasonCodes.push(code);
    };

    if (!targetRow.listing_name || targetRow.listing_name.trim().length === 0) {
        addFailure('Missing required listing_name.', 'PENDING_MISSING_LISTING_NAME');
    }

    if (!targetRow.website_url || targetRow.website_url.trim().length === 0) {
        addFailure('Missing required website_url.', 'PENDING_MISSING_SOURCE_URL');
    }

    const patentReference = String(targetRow.patent_reference_num || '').trim();
    if (patentReference) {
        const normalizedPatent = normalizePublicationNumber(patentReference);
        if (!normalizedPatent || isSuspiciousPublicationNumber(normalizedPatent)) {
            addFailure('Patent publication identifier is invalid or suspicious.', 'PENDING_INVALID_PATENT_ID');
        }
    }

    const rawContent = (targetRow.listing_content || '').replace(/<[^>]*>/g, '').trim();
    const wordCount = rawContent.split(/\s+/).filter(Boolean).length;
    if (wordCount < 75) {
        addFailure(`Content too sparse (${wordCount}/75 word minimum).`, 'PENDING_CONTENT_SPARSE');
    }

    const queryText = `${targetRow.keywords || ''} ${targetRow.listing_name || ''}`.toLowerCase();
    const swirIngaasRequested =
        /\bswir\b|short[-\s]?wave infrared/.test(queryText) &&
        /\bingaas\b|indium gallium arsenide/.test(queryText);

    if (swirIngaasRequested) {
        const spectralText = String(targetRow.spectral_range || '').toLowerCase();
        const materialText = String(targetRow.material_composition || '').toLowerCase();
        const sourceText = String(targetRow.source_text || '').toLowerCase();
        const sourceStatus = String(targetRow.source_fetch_status || '').toLowerCase();
        const sourceFetched = sourceStatus === 'fetched';

        if (!sourceFetched) {
            if (sourceStatus === 'timeout') {
                addFailure('Source evidence fetch timed out.', 'PENDING_SOURCE_TIMEOUT');
            } else if (sourceStatus === 'fetch_failed') {
                addFailure('Source evidence fetch failed.', 'PENDING_SOURCE_FETCH_FAILED');
            } else if (sourceStatus === 'missing_url') {
                addFailure('Source evidence URL is missing.', 'PENDING_MISSING_SOURCE_URL');
            } else if (sourceStatus === 'empty') {
                addFailure('Source evidence was empty.', 'PENDING_SOURCE_EMPTY');
            } else {
                addFailure('Source evidence was not verified.', 'PENDING_SOURCE_NOT_VERIFIED');
            }
        }

        const directSourceIngaasEvidence =
            sourceFetched &&
            /\b(?:swir|short[-\s]?wave infrared)\b/.test(sourceText) &&
            (
                /\b(?:n-type|p-type)\s+ingaas\s+absorber\s+layer\b/i.test(sourceText) ||
                /\bingaas[-\s]+based\s+(?:detector|photodetector|camera|array)\b/i.test(sourceText) ||
                /\b(?:absorber\s+layer|detector|photodetector|camera|array)\b[^.!?]{0,120}\b(?:comprises|contains|includes|uses|incorporates|implemented\s+as)\b[^.!?]{0,120}\b(?:ingaas|indium gallium arsenide)\b/i.test(sourceText) ||
                /\bcan(?:\s+also)?\s+be\s+implemented\s+as\b[^.!?]{0,160}\b(?:swir|short[-\s]?wave infrared)\b[^.!?]{0,80}\b(?:ingaas|indium gallium arsenide)\b/i.test(sourceText)
            );

        const hasVerifiedSwir =
            sourceFetched &&
            (
                /\bswir\b|short[-\s]?wave infrared|1300\s*(?:-|to)\s*1700\s*nm/.test(spectralText) ||
                /\bswir\b|short[-\s]?wave infrared|1300\s*(?:-|to)\s*1700\s*nm/.test(sourceText)
            );

        const uncertainIngaasEvidence =
            /\b(?:may|might|could|possibly|potentially|such as)\b[^.!?]{0,120}\b(?:ingaas|indium gallium arsenide)\b/i.test(rawContent);

        const affirmativeIngaasEvidence =
            /\b(?:uses?|utilizes?|employs?|comprises?|contains?|incorporates?|based on|implemented as)\b[^.!?]{0,140}\b(?:ingaas|indium gallium arsenide)\b/i.test(rawContent);

        const directSwirIngaasEvidence =
            /\bcan(?:\s+also)?\s+be\s+implemented\s+as\b[^.!?]{0,160}\b(?:swir|short[-\s]?wave infrared)\b[^.!?]{0,80}\b(?:ingaas|indium gallium arsenide)\b/i.test(rawContent);

        const hasStrongInGaAsEvidence =
            sourceFetched &&
            /\b(?:ingaas|indium gallium arsenide)\b/.test(materialText) &&
            (
                directSourceIngaasEvidence ||
                directSwirIngaasEvidence ||
                (!uncertainIngaasEvidence && affirmativeIngaasEvidence)
            );

        const knownNonIngaasDetectorMaterial =
            /\b(?:hgte|mercury telluride|hgcdte|mct|inpsb|indium phosphide antimonide)\b/.test(materialText) &&
            !/\b(?:ingaas|indium gallium arsenide)\b/.test(materialText);

        if (!hasVerifiedSwir) {
            addFailure('SWIR evidence not verified for SWIR InGaAs search.', 'PENDING_NO_SWIR_EVIDENCE');
        }

        if (knownNonIngaasDetectorMaterial) {
            addFailure('Detector material is not verified as InGaAs.', 'PENDING_WRONG_DETECTOR_MATERIAL');
        }

        if (uncertainIngaasEvidence && !directSourceIngaasEvidence) {
            addFailure('InGaAs evidence is conditional or ambiguous.', 'PENDING_AMBIGUOUS_LANGUAGE');
        }

        if (!hasStrongInGaAsEvidence) {
            addFailure('InGaAs material evidence not verified for SWIR InGaAs search.', 'PENDING_NO_INGAAS_EVIDENCE');
        }
    }

    for (let i = 1; i <= totalQAs; i++) {
        const answerField = String(targetRow[`qa_${i}_answer`] ?? '');
        const normalizedAnswer = answerField.trim().toLowerCase();
        const honestNull = [
            'to verify',
            'unknown / to verify',
            'no public evidence found',
        ].includes(normalizedAnswer);
        const minLength = i === 1 || i === 5 ? 4 : 20;

        if (!honestNull && answerField.trim().length < minLength) {
            addFailure(
                `qa_${i}_answer must be at least ${minLength} characters.`,
                'PENDING_QA_INCOMPLETE'
            );
        }
    }

    return {
        passes: failures.length === 0,
        failures,
        reason_codes: reasonCodes,
        post_status: failures.length === 0 ? 'publish' : 'draft',
    };
}
