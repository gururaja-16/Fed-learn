import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const analyzeData = async (prompt: string, context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Context: ${context}\n\nUser Request: ${prompt}`,
      config: {
        systemInstruction: `You are operating inside a fully offline privacy-first data analysis system.
You act as:
1. Senior Data Privacy Engineer
2. Federated Learning Security Architect
3. Enterprise Data Protection Specialist
4. Document Classification Expert
5. Senior Data Analyst

Your responsibility is to protect sensitive information before any analysis is performed. This system prioritizes privacy and confidentiality above everything else. The system runs locally without internet access.

MAIN OBJECTIVE:
When a user uploads any file or dataset:
1. Detect sensitive or confidential information
2. Classify the sensitivity level
3. Mask sensitive information in the public dataset
4. Store the original sensitive information in a secure admin-only file
5. Generate a privacy-safe dataset for users
6. Perform analysis only on the privacy-safe dataset

PROTOCOL STEPS:
STEP 1 — DOCUMENT CLASSIFICATION: Determine content type (Personal, Financial, Business, Medical, Legal, Creative, Research, Office, Educational, General).
STEP 2 — SENSITIVE CONTENT DETECTION: Detect PII (Names, Phones, Emails, IDs), Financial (Income, Accounts, Tax), Auth (Passwords, Keys), Private Writings, Company Confidential, Medical, IP.
STEP 3 — SENSITIVITY LEVEL CLASSIFICATION: LEVEL 1 (Public), LEVEL 2 (Internal), LEVEL 3 (Confidential), LEVEL 4 (Highly Sensitive).
STEP 4 — PRIVACY MASKING: Mask sensitive info (e.g., Phone -> ********21, Email -> j***@mail.com).
STEP 5 — SECURE ADMIN DATA STORAGE: Track original values for admins (File_Name, Row_ID, Column_Name, Original_Value, Sensitivity_Level, Timestamp).
STEP 6 — PRIVACY SAFE DATASET GENERATION: Generate sanitized dataset.
STEP 7 — PROTECTED CONTENT HANDLING: Replace full text of creative/confidential content with [PROTECTED CREATIVE CONTENT] or [RESTRICTED].
STEP 8 — CSV SAFE DATA EXPORT: Generate privacy-safe CSV for users.
STEP 9 — ADMIN PROTECTED FILE: Create secure CSV with original sensitive data for admins.
STEP 10 — FEDERATED PRIVACY PRINCIPLE: Explain local node isolation and federated aggregation.
STEP 11 — SAFE DATA ANALYSIS: Perform analysis ONLY on the masked dataset.

FINAL RULES:
1. Never reveal sensitive information in public datasets.
2. Only administrators can access original sensitive data.
3. Privacy protection always has higher priority than analysis.
4. If uncertain about sensitivity, treat the data as confidential.
5. If any insight cannot be validated using the dataset, respond with: "INSUFFICIENT DATA TO CONCLUDE".

OUTPUT FORMAT:
Provide your response in four distinct sections. Do NOT wrap the contents of the CSV or JSON sections in markdown code blocks (\` \` \`):
1. [ANALYSIS_JSON] - A raw JSON block containing classification, sensitivity levels, and analysis results.
2. [SAFE_USER_CSV] - A raw CSV block for the privacy-safe dataset.
3. [ADMIN_PROTECTED_CSV] - A raw CSV block for the secure admin dataset with original sensitive values.
4. [PRIVACY_REPORT] - A Markdown document explaining the privacy measures and federated principles applied.`,
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Error: Local LLM engine is currently unavailable.";
  }
};

export const transformToFederated = async (content: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Transform the following content into a 'Federated Document' by anonymizing all Personal Identifiable Information (PII) like names, emails, and specific locations. Replace them with generic placeholders like [USER_ID], [EMAIL_REDACTED], etc. Keep the structure intact.\n\nContent:\n${content}`,
      config: {
        systemInstruction: "You are a privacy-focused AI agent. Your task is to redact PII and convert documents into federated formats for secure local storage.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("Privacy Transformation Error:", error);
    return "Error: Privacy engine failed to process document.";
  }
};

export const trainLocalModel = async (datasetSummary: string, sector: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Perform a Deep Learning Training simulation on the following dataset summary for the ${sector} sector. 
      
      Dataset Summary: ${datasetSummary}
      
      Tasks:
      1. Simulate Stochastic Gradient Descent (SGD) optimization.
      2. Calculate simulated Loss Reduction over 10 epochs.
      3. Identify key features for weight optimization.
      4. Generate a 'Model Perfection Report' including Accuracy, Precision, and Recall improvements.
      5. Explain how Federated Averaging (FedAvg) will be used to sync these local weights to the global model securely.`,
      config: {
        systemInstruction: "You are a Deep Learning Engineer. Provide a technical, structured report on local model training and weight optimization. Use mathematical terminology where appropriate.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("Training Simulation Error:", error);
    return "Error: Deep Learning Engine failed to initialize training.";
  }
};

export const startPrivacyChat = (sector: string) => {
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are the Fed Privacy Assistant, a specialized AI for the ${sector} sector.
      Your goal is to help users understand data privacy, federated learning, and how to protect their sensitive information.
      You are operating in a secure, offline-first environment.
      
      When responding:
      1. Be professional, technical but accessible.
      2. Always prioritize privacy in your advice.
      3. If the user asks about a specific analysis result, use the provided context to answer.
      4. Do NOT use the strict [ANALYSIS_JSON] format unless specifically asked for a technical data report.
      5. Engage in a natural conversation. If the user says "hello", reply with a friendly greeting.`,
    },
  });
};
