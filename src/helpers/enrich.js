import axios from 'axios';

export async function enrichWithGooglePlaces(row, googleApiKey, phase) {
    return {};
}

export async function enrichWithOpenAI(row, openaiApiKey, phase, selectedQuestions, modelOverride) {
    const currentPhase = phase ?? 1;
    const apiKey = openaiApiKey;
    const targetRow = row || {};
    const questions = selectedQuestions || [];
    const chosenModel = modelOverride || 'gpt-4.1-nano';

    if (!apiKey) return {};
    if (currentPhase === 2) return {};

    const systemPrompt = `You are a database enrichment engine for an Infrared Patents, Materials, and Industrial Applications directory. Return only a valid JSON object. Never infer specific technical specifications, chemical compositions, patent status, assignee names, or spectral ranges unless directly supported by the provided record text or source URL. Use "Unknown / To Verify" when uncertain. listing_content must use <p> tags only.`;

    const userPrompt = `Record name: ${targetRow.listing_name}\nInitial specifications: ${targetRow.technical_specifications}\nSource URL: ${targetRow.website_url}\nCategory: ${targetRow.admin_category}\n\nReturn a flat JSON object with these exact keys: spectral_range, material_composition, listing_content, qa_1_answer, qa_2_answer, qa_3_answer, qa_4_answer, qa_5_answer, qa_6_answer, qa_7_answer.\n\nQuestions:\n1. ${questions[0]}\n2. ${questions[1]}\n3. ${questions[2]}\n4. ${questions[3]}\n5. ${questions[4]}\n6. ${questions[5]}\n7. ${questions[6]}`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: chosenModel,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
        return JSON.parse(response.data.choices[0].message.content.trim());
    } catch (error) {
        console.error(`OpenAI enrichment error on ${targetRow.listing_name}:`, error.message);
        return {};
    }
}
