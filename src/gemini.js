import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyAy7ChuwwnCquI5USozlzNZS-5jA1IHzX8");

export async function analyzeReport(imagePart) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `Analyze these disaster reports. 
    Return a JSON object with this EXACT structure:
    {
      "states": [
        {
          "stateName": "Name of State",
          "totalUrgency": 1-10,
          "problemCounts": { "Water": 2, "Sanitation": 3 },
          "respondents": [
            { 
              "id": "ID", 
              "age": 25, 
              "gender": "M", 
              "problem": "Water", 
              "familySize": 5, 
              "income": "Low" 
            }
          ]
        }
      ]
    }
    Extract every respondent. 'familySize' must be the number of people in that household.`;

    const result = await model.generateContent([prompt, imagePart]);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("AI Error:", error);
    return null;
  }
}
// 2. NEW Function for Volunteer Lists
export async function analyzeVolunteers(filePart) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      generationConfig: { responseMimeType: "application/json" }
    });
    const prompt = 'Extract volunteer data from this document. Return JSON: { "volunteers": [ { "name": "Name", "skill": "Medical/Logistics/Sanitation", "phone": "Number", "location": "City" } ] }';
    const result = await model.generateContent([prompt, filePart]);
    return JSON.parse(result.response.text());
  } catch (e) { return null; }
}
