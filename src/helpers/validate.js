export function passesPublishGate(row, phase, selectedCount) {
    const currentPhase = phase ?? 1;
    const targetRow = row || {};
    const totalQAs = currentPhase === 2 ? 20 : (selectedCount ?? 7);
    const failures = [];

    if (!targetRow.listing_name || targetRow.listing_name.trim().length === 0) failures.push('Missing required listing_name.');
    if (!targetRow.website_url || targetRow.website_url.trim().length === 0) failures.push('Missing required website_url.');

    const rawContent = (targetRow.listing_content || '').replace(/<[^>]*>/g, '').trim();
    const wordCount = rawContent.split(/\s+/).filter(Boolean).length;
    if (wordCount < 75) failures.push(`Content too sparse (${wordCount}/75 word minimum).`);
    const queryText = `${targetRow.keywords || ''} ${targetRow.listing_name || ''}`.toLowerCase();

const swirIngaasRequested =
    /\bswir\b|short[-\s]?wave infrared/.test(queryText) &&
    /\bingaas\b|indium gallium arsenide/.test(queryText);

if (swirIngaasRequested) {
    const spectralText = String(targetRow.spectral_range || '').toLowerCase();
    const materialText = String(targetRow.material_composition || '').toLowerCase();

    const hasVerifiedSwir =
        /\bswir\b|short[-\s]?wave infrared|1300\s*(?:-|to)\s*1700\s*nm/.test(spectralText);

    const uncertainIngaasEvidence =
        /\b(?:may|might|could|possibly|potentially|such as)\b[^.!?]{0,120}\b(?:ingaas|indium gallium arsenide)\b/i.test(rawContent);

    const affirmativeIngaasEvidence =
        /\b(?:uses?|utilizes?|employs?|comprises?|contains?|incorporates?|based on)\b[^.!?]{0,140}\b(?:ingaas|indium gallium arsenide)\b/i.test(rawContent);

    const hasStrongIngaasEvidence =
        /\bingaas\b|indium gallium arsenide/.test(materialText) &&
        !uncertainIngaasEvidence &&
        affirmativeIngaasEvidence;

    if (!hasVerifiedSwir) {
        failures.push('SWIR evidence not verified for SWIR InGaAs search.');
    }

    if (!hasStrongIngaasEvidence) {
        failures.push('InGaAs material evidence not verified for SWIR InGaAs search.');
    }
}
    for (let i = 1; i <= totalQAs; i++) {
   const answerField = String(targetRow[`qa_${i}_answer`] ?? '');
    const normalizedAnswer = answerField.trim().toLowerCase();
    const honestNull = ['to verify', 'unknown / to verify', 'no public evidence found'].includes(normalizedAnswer);
    const minLength = (i === 1 || i === 5) ? 4 : 20;
    if (!honestNull && answerField.trim().length < minLength) failures.push(`qa_${i}_answer must be at least ${minLength} characters.`);
}
    

    return { passes: failures.length === 0, failures, post_status: failures.length === 0 ? 'publish' : 'draft' };
}
