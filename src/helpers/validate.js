export function passesPublishGate(row, phase, selectedCount) {
    const currentPhase = phase ?? 1;
    const targetRow = row || {};
    const totalQAs = currentPhase === 2 ? 20 : (selectedCount ?? 7);
    const failures = [];

    if (!targetRow.listing_name || targetRow.listing_name.trim().length === 0) failures.push('Missing required listing_name.');
    if (!targetRow.website_url || targetRow.website_url.trim().length === 0) failures.push('Missing required website_url.');

    const rawContent = (targetRow.listing_content || '').replace(/<[^>]*>/g, '').trim();
    const wordCount = rawContent.split(/\s+/).filter(Boolean).length;
    if (wordCount < 100) failures.push(`Content too sparse (${wordCount}/100 word minimum).`);

    for (let i = 1; i <= totalQAs; i++) {
        const answerField = targetRow[`qa_${i}_answer`] || '';
        if (answerField.trim().length < 20) failures.push(`qa_${i}_answer must be at least 20 characters.`);
    }

    return { passes: failures.length === 0, failures, post_status: failures.length === 0 ? 'publish' : 'draft' };
}
