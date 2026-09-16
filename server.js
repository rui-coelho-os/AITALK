import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { externalApi } from './mockExternalApi.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Tool/Function Declarations for Gemini
const toolDefinitions = [
  {
    functionDeclarations: [
      {
  name: "getPolicyDetails",
  description: "Fetch policy information to confirm client details using their name and policy number.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "The client's full name" },
      policyNumber: { type: "STRING", description: "The policy number (e.g., POL-12345)" }
    },
    required: ["name", "policyNumber"]
  }
},
      {
        name: "storeConversationData",
        description: "Store collected conversation details, notes, or incident reports into the database.",
        parameters: {
          type: "OBJECT",
          properties: {
            policyId: { type: "STRING", description: "The associated policy ID" },
            notes: { type: "STRING", description: "Summary or detail of the conversation to save" }
          },
          required: ["policyId", "notes"]
        }
      }
    ]
  }
];

wss.on('connection', (clientWs) => {
  console.log('Client connected to proxy');

  // Connect to Gemini
  const geminiWs = new WebSocket(GEMINI_WS_URL);

  geminiWs.on('open', () => {
    console.log('Connected to Gemini Live API');

    // Send setup configuration directly from server
    const setupPayload = {
      setup: {
        model: "models/gemini-3.1-flash-live-preview",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Despina" }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: "You are an AI insurance assistant. Ask the user for their policy number to verify details using the tools provided. Save notable information using tools when provided." }]
        },
        tools: toolDefinitions
      }
    };

    geminiWs.send(JSON.stringify(setupPayload));
  });

  // Relay messages from client to Gemini
  clientWs.on('message', (message) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(message);
    }
  });

  // Relay messages from Gemini to client, catching Tool Calls along the way
  geminiWs.on('message', async (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Intercept Function/Tool Call requests
      if (response.toolCall) {
        await handleToolCall(geminiWs, response.toolCall);
        return;
      }

      // Forward regular responses (audio/text) to client
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    } catch (e) {
      console.error("Error processing Gemini message:", e);
    }
  });

  clientWs.on('close', () => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on('close', (code, reason) => {
  console.log(`[GEMINI CLOSED] Code: ${code}, Reason: ${reason.toString()}`);
  if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
});
});

// Handle execution of tool calls
async function handleToolCall(geminiWs, toolCall) {
  const functionCalls = toolCall.functionCalls;
  const functionResponses = [];

  for (const call of functionCalls) {
    const { name, args, id } = call;
    let result = {};

    console.log(`[TOOL CALL DETECTED] Calling: ${name}`, args);

   if (name === 'getPolicyDetails') {
  result = await externalApi.getPolicyDetails(args.name, args.policyNumber);
} else if (name === 'storeConversationData') {
      result = await externalApi.storeConversationData(args.policyId, { notes: args.notes });
    }

    functionResponses.push({
      response: { output: result },
      id: id
    });
  }

  // Send tool responses back to Gemini so it can resume audio generation
  const responsePayload = {
    toolResponse: {
      functionResponses: functionResponses
    }
  };

  geminiWs.send(JSON.stringify(responsePayload));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));