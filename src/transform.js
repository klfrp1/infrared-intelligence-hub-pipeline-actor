export function buildOutputRow(seedRow, placesData, openaiData, phase) {
    const currentPhase = phase ?? 1;
    const base = seedRow || {};
    const aiData = openaiData || {};

    const combined = {
        ...base,
        spectral_range: aiData.spectral_range || base.spectral_range || 'Unknown / To Verify',
        material_composition: aiData.material_composition || base.material_composition || 'Unknown / To Verify',
        listing_content: aiData.listing_content || base.listing_content || ''
    };

    const qaCount = currentPhase === 2 ? 20 : 7;
    for (let i = 1; i <= qaCount; i++) {
        const rawAnswer = aiData[`qa_${i}_answer`] ?? base[`qa_${i}_answer`] ?? '';

combined[`qa_${i}_answer`] =
    typeof rawAnswer === 'string'
        ? rawAnswer
        : (rawAnswer?.text || rawAnswer?.answer || rawAnswer?.value || 'To Verify');
    }

    delete combined._ctx_id;
    return combined;
}
