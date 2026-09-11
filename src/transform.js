export function buildOutputRow(seedRow, placesData, openaiData, phase) {
    const currentPhase = phase ?? 1;
    const base = seedRow || {};
    const aiData = openaiData || {};

   const combined = {
  ...base,

  listing_name:
    aiData.listing_name ||
    base.listing_name ||
    'Unknown / To Verify',

  country:
    aiData.country ||
    base.country ||
    'Unknown / To Verify',

  operational_status:
    aiData.operational_status ||
    base.operational_status ||
    'Unknown / To Verify',

  company_assignee:
    aiData.company_assignee ||
    base.company_assignee ||
    'Unknown / To Verify',

  application_area:
    aiData.application_area ||
    base.application_area ||
    'Unknown / To Verify',

  technical_specifications:
    aiData.technical_specifications ||
    base.technical_specifications ||
    'Unknown / To Verify',

  spectral_range:
    aiData.spectral_range ||
    base.spectral_range ||
    'Unknown / To Verify',

  material_composition:
    aiData.material_composition ||
    base.material_composition ||
    'Unknown / To Verify',

  listing_content:
    aiData.listing_content ||
    base.listing_content ||
    ''
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
