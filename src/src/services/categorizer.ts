import { JSON5 } from "bun";
import { complete, getModel, Context, ProviderStreamOptions } from "@earendil-works/pi-ai";


interface IncomingEmailData {
    subject: string;
    body: string;
    metadata?: unknown // TODO: store this data as is
}

interface CategorizationResult {
    description: string;
    confidenceScore: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseCategorizerResponse(text: string): CategorizationResult | null {
    const parsed: unknown = JSON5.parse(text);

    if (!isRecord(parsed)) return null;

    const explanation = parsed.explanation;
    const confidenceScore = parsed.confidenceScore;

    if (typeof explanation !== "string") return null;
    if (typeof confidenceScore !== "number") return null;

    return {
        description: explanation,
        confidenceScore,
    };
}


function buildQuoteCheckPrompt(subject: string, body: string): string {
    if (!subject || !body) throw new Error("Invalid input detected. Please provide an email subject and body");

    return `
        Determine if the provided email is asking for a quote/estimate from the business based on the subject and body contents.

        Return only valid JSON. Do not include markdown, comments, or explanatory text outside the JSON.

        Expected response format:
        {
            "explanation": "The sender is asking the business for a quote.",
            "confidenceScore": 0.7
        }

        Input:
        Subject: ${subject}
        Email Body: ${body}
    `;
}

export async function categorizeEmail(email: IncomingEmailData): Promise<CategorizationResult | null> {
    console.log("incoming email", email);
    
    const model = getModel('openai', 'gpt-4o-mini');
    let prompt = '';
    try {
        prompt = buildQuoteCheckPrompt(email.subject, email.body);   
    } catch (error: unknown) {
        console.log(error);
        return null
    }

    const context: Context = {
        systemPrompt: 'You are an email categorization specialist that reviews inbound emails and determines their intent.',
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
    };
    
    const requestOptions: ProviderStreamOptions = {
        apiKey: process.env.OPENAI_API_KEY,
    };

    const response = await complete(model, context, requestOptions);

    let result: CategorizationResult | null = null;
    for (const block of response.content) {
        if (block.type === 'text') {
            console.log(block.text);

            try {
                result = parseCategorizerResponse(block.text);
            } catch (error) {
                console.error("Failed to parse categorizer response", error);
            }
        }
    }

    if (!result) {
        throw new Error("There was a problem parsing categorization results");
    }

    return result;
}