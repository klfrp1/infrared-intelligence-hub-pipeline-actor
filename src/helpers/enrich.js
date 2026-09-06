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

    const systemPrompt = `You are a database enrichment engine for an Infrared Patents, Materials, and Industrial Applications directory. Return only a valid JSON object. Use only facts directly supported by the supplied source evidence. Never infer specific technical specifications, chemical compositions, patent status, operational status, commercial status, assignee or owner names, or spectral ranges when the evidence does not explicitly support them. For qa_1_answer, do not claim a patent is active, abandoned, expired, maintained, commercialized, or not commercialized unless the supplied evidence explicitly states that status; otherwise use "Unknown / To Verify". For qa_2_answer, distinguish inventors from assignees, applicants, owners, manufacturers, and developers. An inventor must never be identified as an assignee or owner unless the supplied evidence explicitly labels that person or entity as such. If inventors are identified but the assignee or owner is not, state the inventor names separately and keep the assignee or owner as "Unknown / To Verify". Absence of evidence is not evidence of abandonment, inactivity, or lack of commercialization. When uncertain, use "Unknown / To Verify". listing_content must use <p> tags only.`;
const listingContentRule = `When enough source evidence is available, listing_content should be at least 100 words and use only facts directly supported by the source evidence. Do not invent, speculate, repeat, or pad information merely to reach 100 words. If the source evidence does not support a 100-word description, keep listing_content concise and allow the record to remain pending for review.`;
    const userPrompt = `Record name: ${targetRow.listing_name}\nInitial specifications: ${targetRow.technical_specifications}\nSource URL: ${targetRow.website_url}\nCategory: ${targetRow.admin_category}\n\nReturn a flat JSON object with these exact keys: spectral_range, material_composition, listing_content, qa_1_answer, qa_2_answer, qa_3_answer, qa_4_answer, qa_5_answer, qa_6_answer, qa_7_answer.\n\nQuestions:\n1. ${questions[0]}\n2. ${questions[1]}\n3. ${questions[2]}\n4. ${questions[3]}\n5. ${questions[4]}\n6. ${questions[5]}\n7. ${questions[6]}`;
const userPromptWithEvidence = `${userPrompt}\n\nSource fetch status: ${targetRow.source_fetch_status || 'unknown'}\nSource evidence:\n${targetRow.source_text || 'No source evidence fetched.'}\n\nUse the supplied source evidence as the factual basis. Do not treat the URL alone as proof. If a fact is not supported, use "Unknown / To Verify".`;
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: chosenModel,
            messages: [{ role: 'system', content: systemPrompt + ' ' + listingContentRule }, { role: 'user', content: userPromptWithEvidence}],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
        return JSON.parse(response.data.choices[0].message.content.trim());
    } catch (error) {
        console.error(`OpenAI enrichment error on ${targetRow.listing_name}:`, error.message);
        return {};
    }
}
