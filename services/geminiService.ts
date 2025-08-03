/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, Chat } from "@google/genai";

export type { Chat };

// --- TYPE DEFINITIONS (mirror from index.tsx) ---
type Specialty = 'Internal Medicine' | 'Pediatrics' | 'Surgery' | 'Obstetrics & Gynecology' | 'Psychiatry' | 'Cardiology' | 'Neurology' | 'Dermatology' | 'Emergency Medicine';
type TrainingPhase = 'Pre-clinical' | 'Para-clinical' | 'Clinical' | 'Internship' | 'NExT/FMGE Prep';
type CognitiveSkill = 'Recall' | 'Application' | 'Analysis';
type EPA = 'History-taking' | 'Physical Exam' | 'Diagnosis' | 'Management';

interface Diagnosis {
    diagnosis: string;
    isCorrect: boolean;
}

interface ChatMessage {
    sender: 'user' | 'patient';
    text: string;
    timestamp: string;
}

export interface MCQ {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
}

export interface CurriculumTags {
    framework: 'CBME/NExT';
    competency: string;
}

export interface CaseTags {
    trainingPhase: TrainingPhase;
    specialty: Specialty;
    cognitiveSkill: CognitiveSkill;
    epas: EPA[];
    curriculum: CurriculumTags;
}

export interface DiagnosticCase {
    title: string;
    patientProfile: {
        name: string;
        age: number;
        gender: 'Male' | 'Female' | 'Other';
    };
    tags: CaseTags;
    chiefComplaint: string;
    historyOfPresentIllness: string;
    physicalExam: string;
    labResults: string;
    potentialDiagnoses: Diagnosis[];
    mcqs: MCQ[];
    correctDiagnosisExplanation: string;
    soapNote?: string;
}

export interface GenerationFilters {
    trainingPhase: TrainingPhase;
    specialties?: Specialty[];
    epas?: EPA[];
    challengeMode?: boolean;
}

// --- GEMINI API SERVICE ---

let ai: GoogleGenAI;

function getAi(): GoogleGenAI {
    if (ai) {
        return ai;
    }

    // Use env variable if available, otherwise fallback to hardcoded key
    const apiKey = (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY)
        ? process.env.GEMINI_API_KEY
        : "AIzaSyCwhzGqRTqLUXVJXwzVupW-BDUNJEM3Ak0";

    if (!apiKey) {
        throw new Error("Gemini API key not found. Please ensure the GEMINI_API_KEY environment variable is set.");
    }
    
    ai = new GoogleGenAI({ apiKey });
    return ai;
}

const caseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A short, descriptive title for the case (e.g., 'An Elderly Man with Cough and Fever')." },
        patientProfile: {
            type: Type.OBJECT, properties: { name: { type: Type.STRING }, age: { type: Type.INTEGER }, gender: { type: Type.STRING, enum: ["Male", "Female", "Other"] } },
            required: ["name", "age", "gender"],
        },
        tags: {
            type: Type.OBJECT,
            properties: {
                trainingPhase: { type: Type.STRING, enum: ['Pre-clinical', 'Para-clinical', 'Clinical', 'Internship', 'NExT/FMGE Prep'] },
                specialty: { type: Type.STRING },
                cognitiveSkill: { type: Type.STRING, enum: ['Recall', 'Application', 'Analysis'] },
                epas: { type: Type.ARRAY, items: { type: Type.STRING, enum: ['History-taking', 'Physical Exam', 'Diagnosis', 'Management'] } },
                curriculum: {
                    type: Type.OBJECT, properties: { framework: { type: Type.STRING, enum: ['CBME/NExT'] }, competency: { type: Type.STRING } },
                    required: ["framework", "competency"]
                }
            },
            required: ["trainingPhase", "specialty", "cognitiveSkill", "epas", "curriculum"]
        },
        chiefComplaint: { type: Type.STRING },
        historyOfPresentIllness: { type: Type.STRING },
        physicalExam: { type: Type.STRING },
        labResults: { type: Type.STRING },
        potentialDiagnoses: {
            type: Type.ARRAY, items: { type: Type.OBJECT, properties: { diagnosis: { type: Type.STRING }, isCorrect: { type: Type.BOOLEAN } }, required: ["diagnosis", "isCorrect"] },
        },
        mcqs: {
            type: Type.ARRAY, items: {
                type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctAnswerIndex: { type: Type.INTEGER }, explanation: { type: Type.STRING } },
                required: ["question", "options", "correctAnswerIndex", "explanation"]
            },
        },
        correctDiagnosisExplanation: { type: Type.STRING },
    },
    required: ["title", "patientProfile", "tags", "chiefComplaint", "historyOfPresentIllness", "physicalExam", "labResults", "potentialDiagnoses", "mcqs", "correctDiagnosisExplanation"],
};

export async function generateCase(filters: GenerationFilters): Promise<DiagnosticCase> {
    const aiInstance = getAi();
    
    const { trainingPhase, specialties, epas, challengeMode } = filters;
    
    let prompt = `
        You are an expert medical educator specializing in the Indian MBBS curriculum. Your task is to create a clinical case simulation that is strictly aligned with the CBME framework and prepares students for the NExT/FMGE exams.
        Generate a realistic and educational patient case for a medical student.

        **Case Constraints:**
        - The case MUST be suitable for the **${trainingPhase}** training phase.
        - The case's primary specialty MUST be one of the following: ${specialties && specialties.length > 0 ? specialties.join(', ') : 'any common medical specialty'}.
    `;

    if (epas && epas.length > 0) {
        prompt += `\n- The case MUST primarily test these Entrustable Professional Activities (EPAs): ${epas.join(', ')}.`;
    }
    if (challengeMode) {
        prompt += `\n- **Challenge Mode Active:** Create a complex, interdisciplinary case that may span multiple systems or present with atypical symptoms.`;
    }

     prompt += `
        **Curriculum Alignment Instructions:**
        1.  After creating the case details, you MUST map it to a specific competency from the official NMC competency list for the Indian MBBS curriculum.
        2.  The 'framework' tag must be 'CBME/NExT'.
        3.  The 'cognitiveSkill' tag should be assigned based on the primary thinking process required for the case (Recall, Application, or Analysis).

        **Final Instructions:**
        - Ensure exactly one diagnosis in the potentialDiagnoses array is marked as correct.
        - Generate 3 distinct and relevant multiple-choice questions (MCQs).
        - Provide all required fields in the specified JSON format.
    `;

    const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: caseSchema,
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsedCase = JSON.parse(jsonText) as DiagnosticCase;
        if (!parsedCase.patientProfile || parsedCase.potentialDiagnoses.filter(d => d.isCorrect).length !== 1 || !parsedCase.mcqs || parsedCase.mcqs.length < 1 || !parsedCase.tags || !parsedCase.tags.curriculum) {
             throw new Error("The patient case data is malformed or invalid.");
        }
        return parsedCase;
    } catch (e) {
        console.error("Failed to parse or validate generated case:", response.text, e);
        throw new Error(`The AI returned an invalid data structure for the patient. Please try again.`);
    }
}


export async function generateSoapNoteForCase(caseData: DiagnosticCase): Promise<string> {
    const aiInstance = getAi();
    const prompt = `
        Generate a detailed SOAP note for the following patient case.
        Format it with clear section headers: Subjective, Objective, Assessment, and Plan.
        Each section header should be on a new line and bolded (e.g., **Subjective:**).
        Include physical exam findings, labs, vitals, and clinical reasoning.
        Tailor the language to reflect real-world physician documentation used in clinical practice.
        Case Data: ${JSON.stringify(caseData, null, 2)}
    `;

    const response = await aiInstance.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text.trim();
}

export async function generateHint(caseData: DiagnosticCase, chatHistory: ChatMessage[]): Promise<string> {
    const aiInstance = getAi();
    const formattedHistory = chatHistory.map(msg => `${msg.sender === 'user' ? 'Doctor' : 'Patient'}: ${msg.text}`).join('\n');
    const prompt = `
        You are an expert clinical tutor. Your role is to provide a subtle hint to a medical student who is diagnosing a patient.
        Based on the patient's case and the conversation history so far, provide one short, simple question the student should consider asking next.
        **RULES:**
        1. The hint MUST be a question.
        2. Do NOT give away the diagnosis or explain why.
        3. Keep the hint very short.
        4. Base the hint on what's missing from the conversation.
        **Patient Case:** ${JSON.stringify(caseData, null, 2)}
        **Conversation History:**\n${formattedHistory}
        Provide the next best question to ask as a hint.
    `;

    const response = await aiInstance.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text.trim().replace(/"/g, ''); // Remove quotes from response
}


export async function createChatForCase(caseData: DiagnosticCase): Promise<Chat> {
    const aiInstance = getAi();
    const { name, age } = caseData.patientProfile;
    
    const isChildCase = age < 7;
    let systemInstruction: string;
    
    if (isChildCase) {
        systemInstruction = `
            You are a patient simulator for a medical training application.
            You will roleplay as the mother of ${name}, a ${age}-year-old child. Do NOT act as a doctor or AI.
            You are bringing your child to the doctor. All your answers should be from your perspective as a concerned parent.
            Your personality should be that of a worried mother.
            **RULES:**
            1. Only answer questions about your child based on the provided 'chiefComplaint' and 'historyOfPresentIllness'.
            2. You DO NOT know the 'physicalExam' results, 'labResults', or the 'finalDiagnosis' for your child. If asked, say you don't know or that's what you're here to find out.
            3. Answer concisely and naturally.
            4. Do not break character. Always speak as the mother.
        `;
    } else {
        systemInstruction = `
            You are a patient simulator for a medical training application.
            You will roleplay as ${name}, a ${age}-year-old patient. Do NOT act as a doctor or AI.
            Your personality should be consistent with your condition.
            **RULES:**
            1. Only answer questions based on the 'chiefComplaint' and 'historyOfPresentIllness' sections.
            2. You DO NOT know your 'physicalExam', 'labResults', or 'finalDiagnosis'. If asked, say you don't know.
            3. Answer concisely and naturally.
            4. Do not break character.
        `;
    }
    
    return aiInstance.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction },
        history: [{
          role: "user", parts: [{ text: `Case Context: ${JSON.stringify(caseData)}` }],
        },{
          role: "model", parts: [{ text: "I understand. I am ready to begin the simulation." }],
        }]
    });
}
