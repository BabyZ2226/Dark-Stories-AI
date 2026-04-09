import { GoogleGenAI, Type } from "@google/genai";
import { Case, Question } from "../types";

// Use a safer way to access the API key that works in both dev and prod
const getApiKey = () => {
  // Try to get it from process.env (injected by Vite define)
  const key = (process as any).env?.GEMINI_API_KEY;
  if (key && key !== 'undefined' && key !== 'null' && key !== '') return key;
  return null;
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-api-key' });

export const INITIAL_CASES: Case[] = [
  {
    id: "1",
    title: "El Hombre en el Ascensor",
    mystery: "Un hombre vive en el décimo piso de un edificio. Todos los días toma el ascensor hasta la planta baja para ir a trabajar. Cuando vuelve, toma el ascensor hasta el séptimo piso y sube el resto por las escaleras. Sin embargo, en los días de lluvia, sube directamente hasta el décimo piso. ¿Por qué?",
    solution: "El hombre es un enano. Solo puede alcanzar el botón del séptimo piso en el ascensor. En los días de lluvia, usa su paraguas para presionar el botón del décimo piso.",
    icon: "Umbrella"
  },
  {
    id: "2",
    title: "Muerte en el Desierto",
    mystery: "Un hombre es encontrado muerto en medio del desierto. Está completamente desnudo y tiene un trozo de cerilla (fósforo) quemado en la mano. No hay huellas a su alrededor. ¿Qué pasó?",
    solution: "El hombre estaba en un globo aerostático con otros amigos. El globo estaba perdiendo altura y arrojaron todo el lastre, incluida su ropa. Finalmente, tuvieron que echar a suertes quién saltaría para salvar a los demás. El hombre sacó la cerilla más corta (quemada) y tuvo que saltar.",
    icon: "Flame"
  },
  {
    id: "3",
    title: "La Ventana Abierta",
    mystery: "Juan yacía muerto en el suelo, rodeado de cristales rotos y agua. No había marcas en su cuerpo y no había sido envenenado. La ventana estaba abierta. ¿Cómo murió?",
    solution: "Juan era un pez de colores. El viento hizo que la ventana se abriera de golpe, tirando la pecera al suelo. La pecera se rompió y Juan murió por falta de agua.",
    icon: "Waves"
  }
];

export async function askQuestion(currentCase: Case, questionText: string): Promise<Question['answer']> {
  if (!apiKey || apiKey === 'missing-api-key') {
    console.error("API Key is missing. Please set GEMINI_API_KEY.");
    return "NO PUEDO RESPONDER";
  }

  const prompt = `
    Estamos jugando a "Dark Stories" (Historias Negras). 
    El caso es: "${currentCase.mystery}"
    La solución secreta es: "${currentCase.solution}"
    
    El usuario hace la siguiente pregunta: "${questionText}"
    
    Responde basándote ÚNICAMENTE en la solución secreta. 
    Tus opciones de respuesta son:
    - "SÍ": Si la pregunta es correcta según la solución.
    - "NO": Si la pregunta es incorrecta según la solución.
    - "IRRELEVANTE": Si la pregunta no tiene nada que ver con la resolución del misterio.
    - "NO PUEDO RESPONDER": Si la pregunta no es de sí o no, o es ambigua.

    IMPORTANTE: No des explicaciones, no reveles la solución, responde SOLO con una de las 4 opciones anteriores en mayúsculas.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.1, // Very low for high precision in Yes/No answers
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 10, // We only need one word
      }
    });

    const answer = response.text?.trim().toUpperCase() as Question['answer'];
    
    // Validación básica por si la IA se desvía
    if (["SÍ", "NO", "IRRELEVANTE", "NO PUEDO RESPONDER"].includes(answer)) {
      return answer;
    }
    
    if (answer.includes("SÍ")) return "SÍ";
    if (answer.includes("NO")) return "NO";
    
    return "IRRELEVANTE";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "NO PUEDO RESPONDER";
  }
}

export async function generateNewCase(difficulty: string = 'Medio'): Promise<Case> {
  if (!apiKey || apiKey === 'missing-api-key') {
    console.error("API Key is missing. Please set GEMINI_API_KEY.");
    alert("Falta la clave de API de Gemini. Si estás en GitHub, asegúrate de configurarla en los Secrets.");
    return { ...INITIAL_CASES[0], difficulty: difficulty as any };
  }

  const prompt = `
    Genera un nuevo caso de "Dark Stories" (Historias Negras) con dificultad ${difficulty}. 
    - Fácil: El misterio es directo y la solución es lógica y común.
    - Medio: El misterio es críptico y requiere pensamiento lateral moderado.
    - Difícil: El misterio es muy extraño y la solución es extremadamente ingeniosa y poco obvia.

    Debe tener un título, un misterio corto y críptico, y una solución lógica pero sorprendente.
    También asigna un nombre de icono de Lucide React que represente el tema (ej: "Umbrella", "Flame", "Waves", "Wind", "Cloud", "Sun", "Moon", "Key", "Lock", "Door", "Camera", "Phone", "Car", "Plane", "Ship", "Anchor", "Map", "Compass", "Book", "Pen", "Music", "Heart", "Star", "CloudRain", "Snowflake", "Zap", "Droplets", "Thermometer", "Clock", "Watch", "Calendar", "Bell", "Flag", "Trophy", "Award", "Medal", "Target", "Search", "ZoomIn", "ZoomOut", "Eye", "EyeOff", "User", "Users", "UserPlus", "UserMinus", "Settings", "Trash", "Home", "Briefcase", "Gift", "Coffee", "Utensils", "ShoppingCart", "CreditCard", "Smartphone", "Tablet", "Monitor", "Laptop", "Printer", "Camera", "Video", "Mic", "Headphones", "Speaker", "Bluetooth", "Wifi", "Battery", "Cloud", "Sun", "Moon", "CloudRain", "Snowflake", "Zap", "Droplets", "Thermometer", "Clock", "Watch", "Calendar", "Bell", "Flag", "Trophy", "Award", "Medal", "Target", "Search", "ZoomIn", "ZoomOut", "Eye", "EyeOff", "User", "Users", "UserPlus", "UserMinus", "Settings", "Trash", "Home", "Briefcase", "Gift", "Coffee", "Utensils", "ShoppingCart", "CreditCard", "Smartphone", "Tablet", "Monitor", "Laptop", "Printer").
    Responde en formato JSON con los campos: title, mystery, solution, icon.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.9, // Higher temperature for more creative and varied mysteries
        topP: 1.0,
        topK: 64,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            mystery: { type: Type.STRING },
            solution: { type: Type.STRING },
            icon: { type: Type.STRING }
          },
          required: ["title", "mystery", "solution", "icon"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      id: Math.random().toString(36).substr(2, 9),
      difficulty: difficulty as any,
      ...data
    };
  } catch (error) {
    console.error("Error generating case:", error);
    return { ...INITIAL_CASES[0], difficulty: 'Medio' }; // Fallback
  }
}
