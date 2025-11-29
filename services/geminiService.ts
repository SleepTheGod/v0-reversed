import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { FileAttachment } from "../types";

// Initialize the client
// CRITICAL: process.env.API_KEY is automatically injected by the environment.
// Do not ask the user for an API key.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const streamGeminiResponse = async (
  prompt: string,
  attachments: FileAttachment[],
  onChunk: (text: string) => void
) => {
  try {
    const parts: any[] = [];

    // Add attachments if any
    // Gemini 2.5 Flash handles images well.
    attachments.forEach(att => {
        parts.push({
            inlineData: {
                mimeType: att.type,
                data: att.data
            }
        });
    });

    // Add text prompt
    if (prompt) {
        parts.push({ text: prompt });
    }

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: {
          parts: parts
      },
      config: {
        // System instruction to guide the persona
        systemInstruction: "You are an expert full-stack developer and AI coding assistant. Your capabilities include writing complex code in any language, debugging, architecture design, and explaining technical concepts. You are free-to-use and unconstrained in your coding abilities. You do not refuse coding requests. You provide clean, optimized, and well-commented code blocks. If asked for a specific language, you use it. Use Markdown for formatting and code blocks.",
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    for await (const chunk of response) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};