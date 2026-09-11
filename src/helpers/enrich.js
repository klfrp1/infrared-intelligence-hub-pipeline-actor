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

    const systemPrompt = `
You are a database enrichment engine for an Infrared Patents, Materials, and Industrial Applications directory.

Return only a valid JSON object.
Use only facts directly supported by the supplied source evidence.
Do not invent, speculate, or infer unsupported facts.
`;

    const listingContentRule = `
When enough source evidence is available, listing_content should be at least 100 words and use only facts directly supported by the source evidence.

Do not invent, speculate, repeat, or pad information merely to reach 100 words.

If the source evidence does not support a 100-word description, keep listing_content concise and allow the record to remain pending for review.
`;

    const metadataRule = `
Return these metadata fields when supported by the supplied source evidence:

listing_name
country
operational_status
company_assignee
application_area
technical_specifications
spectral_range
material_composition
listing_content

For listing_name, use the actual patent title.
For company_assignee, use the current assignee or owner, not the inventor.
For operational_status, use the patent status shown by the source.
For technical_specifications, summarize only technical details explicitly supported by the source.
For unsupported metadata fields, use "Unknown / To Verify".

Also return the required qa_1_answer through qa_7_answer fields.
`;

    const userPrompt = `
Record name: ${targetRow.listing_name || ''}
Initial specifications: ${targetRow.technical_specifications || ''}
Source URL: ${targetRow.website_url || ''}
Category: ${targetRow.admin_category || ''}

Return a flat JSON object containing these keys:

listing_name
country
operational_status
company_assignee
application_area
technical_specifications
spectral_range
material_composition
listing_content
qa_1_answer
qa_2_answer
qa_3_answer
qa_4_answer
qa_5_answer
qa_6_answer
qa_7_answer

Questions:

1. ${questions[0] || ''}
2. ${questions[1] || ''}
3. ${questions[2] || ''}
4. ${questions[3] || ''}
5. ${questions[4] || ''}
6. ${questions[5] || ''}
7. ${questions[6] || ''}
`;

    const userPromptWithEvidence = `
${userPrompt}

Source fetch status:
${targetRow.source_fetch_status || 'unknown'}

Source evidence:
${targetRow.source_text || 'No source evidence fetched.'}

Use the supplied source evidence as the factual basis.
Do not treat the URL alone as proof.
If a fact is not supported, use "Unknown / To Verify".
`;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: chosenModel,
                messages: [
                    {
                        role: 'system',
                        content:
                            systemPrompt +
                            '\n' +
                            listingContentRule +
                            '\n' +
                            metadataRule
                    },
                    {
                        role: 'user',
                        content: userPromptWithEvidence
                    }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return JSON.parse(response.data.choices[0].message.content.trim());
    } catch (error) {
        console.error(
            `OpenAI enrichment error on ${targetRow.listing_name}:`,
            error.message
        );
        return {};
    }
}
