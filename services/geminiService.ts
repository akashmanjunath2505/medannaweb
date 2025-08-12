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
        ethnicity: 'Asian' | 'Black' | 'Caucasian' | 'Hispanic' | 'Middle Eastern' | 'South Asian' | 'Other';
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

export interface EPAScore {
    epa: 'History-taking' | 'Physical Exam';
    score: number;
    justification: string;
}


// --- GEMINI API SERVICE ---

function getAi(): GoogleGenAI {
    // As per the platform's execution environment, we can expect process.env.API_KEY to be available.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        // Throw a specific error if the API key is not configured.
        throw new Error("Gemini API key not found. Please ensure the API_KEY environment variable is set.");
    }
    
    // Create a new instance for each call to ensure statelessness.
    return new GoogleGenAI({ apiKey });
}

const caseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A short, descriptive title for the case (e.g., 'An Elderly Man with Cough and Fever')." },
        patientProfile: {
            type: Type.OBJECT, properties: {
                name: { type: Type.STRING },
                age: { type: Type.INTEGER },
                gender: { type: Type.STRING, enum: ["Male", "Female", "Other"] },
                ethnicity: { type: Type.STRING, enum: ['Asian', 'Black', 'Caucasian', 'Hispanic', 'Middle Eastern', 'South Asian', 'Other'] }
            },
            required: ["name", "age", "gender", "ethnicity"],
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
        - The patient's ethnicity MUST be chosen from: Asian, Black, Caucasian, Hispanic, Middle Eastern, South Asian, Other.
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
        if (!parsedCase.patientProfile || !parsedCase.patientProfile.ethnicity || parsedCase.potentialDiagnoses.filter(d => d.isCorrect).length !== 1 || !parsedCase.mcqs || parsedCase.mcqs.length < 1 || !parsedCase.tags || !parsedCase.tags.curriculum) {
             throw new Error("The patient case data is malformed or invalid.");
        }
        return parsedCase;
    } catch (e) {
        console.error("Failed to parse or validate generated case:", response.text, e);
        throw new Error(`The AI returned an invalid data structure for the patient. Please try again.`);
    }
}

export async function pickSpecialtyForCase(trainingPhase: TrainingPhase): Promise<Specialty> {
    const aiInstance = getAi();
    const specialtiesList: Specialty[] = ['Internal Medicine', 'Pediatrics', 'Surgery', 'Obstetrics & Gynecology', 'Psychiatry', 'Cardiology', 'Neurology', 'Dermatology', 'Emergency Medicine'];

    const prompt = `
        A medical student in the "${trainingPhase}" training phase needs a new case.
        Pick one single medical specialty from the following list that is appropriate for their level:
        ${specialtiesList.join(', ')}

        Respond with ONLY the name of the specialty. For example: "Cardiology"
    `;

    try {
        const response = await aiInstance.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const specialty = response.text.trim();

        // Basic validation to ensure the model returned a valid specialty from our list
        if (specialtiesList.includes(specialty as Specialty)) {
            return specialty as Specialty;
        }
    } catch (error) {
        console.error("Failed to pick a specialty, will fallback.", error);
    }
    
    // Fallback if the model returns something weird or fails
    console.warn("AI specialty picking failed or returned invalid response. Falling back to 'Internal Medicine'.");
    return 'Internal Medicine'; 
}

export function createChatForCase(caseData: DiagnosticCase): Chat {
    const aiInstance = getAi();
    
    // Determine if we're talking to the patient or a guardian
    const patientPersona = caseData.patientProfile.age < 7
        ? `${caseData.patientProfile.name}'s mother`
        : caseData.patientProfile.name;

    const systemInstruction = `
You are role-playing as a patient (or their guardian) in a medical simulation. Your name is ${patientPersona}. You are a ${caseData.patientProfile.age}-year-old ${caseData.patientProfile.gender}.

Your personality and knowledge are based ONLY on the following case information. Do not reveal this information unless the user (the 'doctor') asks a relevant question. Do not act like an AI. Your answers should be natural and conversational, reflecting how a real person would speak.

- **Chief Complaint:** "${caseData.chiefComplaint}"
- **History of Present Illness:** ${caseData.historyOfPresentIllness}
- **Physical Exam Findings (only reveal if the doctor asks to perform a specific exam):** ${caseData.physicalExam}
- **Lab Results (only reveal if the doctor asks for specific tests):** ${caseData.labResults}

**Rules of Engagement:**
- Respond from the perspective of ${patientPersona}.
- Answer only what is asked. Do not volunteer information from the case history unless prompted.
- If asked a question that cannot be answered from the provided information, respond naturally, like "I don't know," or "The doctor didn't tell me about that."
- If the user asks for a physical exam or lab test, provide ONLY the relevant finding from the case data. For example, if asked "How does your chest sound?", you can say "The doctor listened with a stethoscope and said... [provide auscultation findings]".
- Keep your answers concise and human-like.
- **Do not, under any circumstances, provide a diagnosis or medical advice.** Your role is to be the patient.
`;

    const chat = aiInstance.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction },
    });
    return chat;
}

export async function generateSoapNoteForCase(caseData: DiagnosticCase): Promise<string> {
    const aiInstance = getAi();
    const prompt = `
        Based on the following clinical case, please generate a comprehensive SOAP note.
        A SOAP note consists of four parts: Subjective, Objective, Assessment, and Plan.

        **Case Details:**
        - **Title:** ${caseData.title}
        - **Patient:** ${caseData.patientProfile.name}, ${caseData.patientProfile.age}, ${caseData.patientProfile.gender}
        - **Chief Complaint:** ${caseData.chiefComplaint}
        - **History of Present Illness:** ${caseData.historyOfPresentIllness}
        - **Physical Exam:** ${caseData.physicalExam}
        - **Lab Results:** ${caseData.labResults}
        - **Final Diagnosis:** ${caseData.potentialDiagnoses.find(d => d.isCorrect)?.diagnosis}

        **Instructions:**
        - **Subjective:** Summarize the patient's chief complaint and history of present illness.
        - **Objective:** Summarize the relevant findings from the physical exam and lab results.
        - **Assessment:** State the final diagnosis.
        - **Plan:** Propose a brief, appropriate management plan based on the diagnosis.

        Please format the output clearly with headings for S, O, A, and P.
    `;

    const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text;
}

export async function generateHint(caseData: DiagnosticCase, chatHistory: ChatMessage[]): Promise<string> {
    const aiInstance = getAi();
    const history = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are a medical education assistant. A student is working through a clinical case and has asked for a hint.
        Your task is to provide a single, concise, and helpful Socratic-style question to guide them without giving away the answer.

        **Case Information:**
        - **Training Phase:** ${caseData.tags.trainingPhase}
        - **Chief Complaint:** ${caseData.chiefComplaint}
        - **Correct Diagnosis:** ${caseData.potentialDiagnoses.find(d => d.isCorrect)?.diagnosis}

        **Student's Conversation with Patient so far:**
        ${history}

        **Instructions:**
        1. Analyze the conversation history.
        2. Identify what key area the student might be missing (e.g., a specific part of the history, a relevant physical exam, a differential diagnosis).
        3. Formulate a single question to prompt them in the right direction. For example, "Have you considered asking about...?" or "What physical exam finding might be relevant for...?"
        4. The hint should be appropriate for a student in the ${caseData.tags.trainingPhase} phase.
        
        Respond with ONLY the hint question.
    `;

    const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text.trim();
}

export async function evaluateChatForEPAs(caseData: DiagnosticCase, chatHistory: ChatMessage[]): Promise<EPAScore[]> {
    const aiInstance = getAi();
    // Filter out patient thinking messages for cleaner history
    const history = chatHistory
      .filter(m => m.text !== 'Thinking...')
      .map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are a medical education expert. Your task is to evaluate a student's performance in a clinical simulation based on their conversation with the patient.
        You will score their performance on two Entrustable Professional Activities (EPAs): History-taking and Physical Exam.

        **Case Information:**
        - **History of Present Illness (Key Information to be gathered):** ${caseData.historyOfPresentIllness}
        - **Physical Exam Findings (Key findings to be elicited):** ${caseData.physicalExam}
        - **Correct Diagnosis:** ${caseData.potentialDiagnoses.find(d => d.isCorrect)?.diagnosis}

        **Student's Conversation with Patient:**
        ${history}

        **Evaluation Instructions:**
        1.  **History-taking Score:** Analyze the conversation. Did the student ask questions that successfully elicited the key information from the 'History of Present Illness'? Score them from 0 (no relevant questions) to 10 (elicited all crucial details). Provide a brief justification for your score.
        2.  **Physical Exam Score:** Analyze the conversation. Did the student ask for the relevant physical exams that would lead to the findings listed in 'Physical Exam Findings'? They don't need to ask for every single exam, but they should ask for the ones that reveal the most important diagnostic clues. Score them from 0 to 10. Provide a brief justification.

        Respond with a JSON object that strictly adheres to the following schema. The output MUST be an array of two objects, one for each EPA.
    `;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                epa: { type: Type.STRING, enum: ['History-taking', 'Physical Exam'] },
                score: { type: Type.NUMBER, description: "A score from 0 to 10." },
                justification: { type: Type.STRING }
            },
            required: ["epa", "score", "justification"]
        }
    };

    const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema,
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText) as EPAScore[];
        if (parsed.length !== 2 || !parsed.find(p => p.epa === 'History-taking') || !parsed.find(p => p.epa === 'Physical Exam')) {
            throw new Error("Invalid EPA evaluation format returned.");
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse EPA evaluation:", response.text, e);
        // Return a default/error state
        return [
            { epa: 'History-taking', score: 0, justification: 'Evaluation failed due to an AI error.' },
            { epa: 'Physical Exam', score: 0, justification: 'Evaluation failed due to an AI error.' }
        ];
    }
}


// --- VIDEO SELECTION LOGIC ---
interface AvatarData {
    key: string;
    description: string;
    gender: 'Male' | 'Female';
    ageRange: [number, number];
    videos: {
        idle: string; // video ID
        talking: string; // video ID
    };
}

// Data is now structured in pairs, ensuring idle/talking videos are from the same avatar.
const AVATAR_DATA: AvatarData[] = [
    { key: 'old_woman', description: 'An elderly woman (60-99 years)', gender: 'Female', ageRange: [60, 99], videos: { talking: '68948ea7aa43dddb5c4b08d8', idle: '68948ea5aa43dddb5c4b08c4' }},
    { key: 'old_man', description: 'An elderly man (60-99 years)', gender: 'Male', ageRange: [60, 99], videos: { talking: '68948ea4aa43dddb5c4b08a2', idle: '68948e058d992eda26aeb7fe' }},
    { key: 'middle_aged_man', description: 'A middle-aged man (45-60 years)', gender: 'Male', ageRange: [45, 60], videos: { talking: '68948e5bbcf5dc9e17266b7e', idle: '68948e058d992eda26aeb7fe' }},
    { key: 'man_30s_40s', description: 'A man in his 30s-40s', gender: 'Male', ageRange: [30, 45], videos: { talking: '68948dfabcf5dc9e172664cf', idle: '68948da7aa43dddb5c4af70c' }},
    { key: 'man_20s', description: 'A man in his 20s', gender: 'Male', ageRange: [23, 30], videos: { talking: '68948df28d992eda26aeb624', idle: '68948da5aa43dddb5c4af6e1' }},
    { key: 'lady_30s_40s', description: 'A woman in her 30s-40s', gender: 'Female', ageRange: [30, 45], videos: { talking: '68948d9eaa43dddb5c4af667', idle: '68948d33bcf5dc9e172655ec' }},
    { key: 'lady_20s', description: 'A woman in her 20s', gender: 'Female', ageRange: [23, 30], videos: { talking: '68948d98aa43dddb5c4af5ff', idle: '68948d0aaa43dddb5c4aeb10' }},
    // The "girl" avatar was removed to prevent sharing a talking animation with this one.
    { key: 'young_female', description: 'A young female (7-22 years)', gender: 'Female', ageRange: [7, 22], videos: { talking: '68948d09bcf5dc9e172652f0', idle: '68948d098d992eda26aea4c2' }},
    { key: 'adolescent_boy', description: 'An adolescent boy (15-22 years)', gender: 'Male', ageRange: [15, 22], videos: { talking: '68948d098d992eda26aea4b2', idle: '68948d098d992eda26aea4c2' }},
    { key: 'young_boy', description: 'A young boy (7-15 years)', gender: 'Male', ageRange: [7, 15], videos: { talking: '68948d098d992eda26aea4c4', idle: '68948d0aaa43dddb5c4aeae7' }},
];

// A deterministic fallback in case the LLM fails
function findBestFallback(patientProfile: DiagnosticCase['patientProfile']): { idle: string | null; talking: string | null } {
    const { age, gender } = patientProfile;
    
    const candidates = AVATAR_DATA.filter(avatar => 
        (avatar.gender === gender || gender === 'Other') &&
        age >= avatar.ageRange[0] &&
        age <= avatar.ageRange[1]
    );

    // Prioritize exact gender match
    let bestMatch = candidates.find(c => c.gender === gender);
    // If no exact match (e.g., for 'Other'), take the first candidate in the age range.
    if (!bestMatch) {
        bestMatch = candidates[0];
    }
    
    // If still no match, find the one with the smallest age difference
    if (!bestMatch) {
        let minDiff = Infinity;
        AVATAR_DATA.forEach(avatar => {
            if (avatar.gender === gender || gender === 'Other') {
                const diff = Math.min(Math.abs(age - avatar.ageRange[0]), Math.abs(age - avatar.ageRange[1]));
                if (diff < minDiff) {
                    minDiff = diff;
                    bestMatch = avatar;
                }
            }
        });
    }

    if (bestMatch) {
        return {
            idle: bestMatch.videos.idle,
            talking: bestMatch.videos.talking
        };
    }
    
    // Absolute fallback
    return { idle: null, talking: null };
}

export async function pickBestVideo(
    patientProfile: DiagnosticCase['patientProfile'],
): Promise<{ idle: string | null; talking: string | null }> {
    const aiInstance = getAi();
    
    // Create a list of descriptions for the prompt.
    const avatarChoices = AVATAR_DATA.map(avatar => `- key: ${avatar.key}, description: ${avatar.description}`).join('\n');
    
    const prompt = `
        You are a video selection expert. Based on the patient's profile, select the most appropriate avatar from the list below.
        The patient is a ${patientProfile.age}-year-old ${patientProfile.gender}.

        Available avatars:
        ${avatarChoices}

        Select the single best avatar 'key' that matches the patient's age and gender. Your response must be a JSON object with a single key: "selected_key". The value should be the key of the selected avatar.
        For example:
        {
          "selected_key": "man_30s_40s"
        }
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            selected_key: { type: Type.STRING },
        },
        required: ["selected_key"],
    };

    try {
        const response = await aiInstance.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema,
            }
        });

        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText) as { selected_key: string };
        
        const selectedAvatar = AVATAR_DATA.find(avatar => avatar.key === parsed.selected_key);
        
        if (selectedAvatar) {
            return {
                idle: selectedAvatar.videos.idle,
                talking: selectedAvatar.videos.talking,
            };
        } else {
             console.warn(`AI selected an invalid avatar key: ${parsed.selected_key}. Falling back.`);
             return findBestFallback(patientProfile);
        }
    } catch(e) {
        console.error("Failed to parse avatar selection from AI:", e);
        return findBestFallback(patientProfile);
    }
}