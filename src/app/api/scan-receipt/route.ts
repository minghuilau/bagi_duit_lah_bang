import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Image, mimeType } = body;

    if (!base64Image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Using the most stable model 
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = `
      Analyze this Malaysian receipt. Extract the individual food/beverage line items and their base prices.
      Also, identify any taxes (like 6% SST) or service charges (like 10%). 
      Add those percentages together and return them as a single number in the 'taxPercentage' field (e.g., if there is 6% SST and 10% Service Charge, return 16).
      If no tax is listed, return 0.

      Return the result STRICTLY matching this JSON structure:
      {
        "items": [
          {"name": "ZUS Spanish Latte", "price": 11.90}, 
          {"name": "Tealive Bang Bang", "price": 8.90}
        ],
        "taxPercentage": 16
      }
    `;

    const imageParts = [{ inlineData: { data: base64Image, mimeType: mimeType } }];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const response = await result.response;
    const text = response.text();
    
    //console.log("RAW AI RESPONSE:", text); 
    
    // Parse the perfectly formatted JSON
    const data = JSON.parse(text);

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error scanning receipt:', error);
    return NextResponse.json({ error: 'Failed to scan receipt' }, { status: 500 });
  }
}