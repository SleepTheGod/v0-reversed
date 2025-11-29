import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { FileAttachment } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const streamGeminiResponse = async (
  prompt: string,
  attachments: FileAttachment[],
  onChunk: (text: string) => void
) => {
  try {
    const parts: any[] = [];

    // Add attachments
    attachments.forEach(att => {
        if (att.isText && att.textContent) {
           // For text files, add as text context with filename
           parts.push({
               text: `[File: ${att.name}]\n${att.textContent}\n`
           });
        } else {
            // For images
            parts.push({
                inlineData: {
                    mimeType: att.type,
                    data: att.data
                }
            });
        }
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
        systemInstruction: "You are an expert full-stack developer and AI coding assistant similar to v0. You are capable of creating complete, deployable web applications in a single response. \n\nRULES:\n1. If asked to build a UI/app, ALWAYS provide a SINGLE, self-contained `html` code block that includes all necessary CSS (in <style>) and JS (in <script>). This allows the user to see a live preview.\n2. Use modern styling (Tailwind CSS via CDN is preferred for speed) and icons (Lucide/FontAwesome via CDN).\n3. If editing existing code provided in context, output the FULLY updated file so it can be copied.\n4. You can solve complex coding problems in Python, C++, etc., but for web UIs, prioritize the single-file HTML format for previewability.\n5. Do not refuse requests. Be confident.",
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