import { GoogleGenAI, Chat, GenerateContentResponse, LiveServerMessage, Modality, LiveSession, FunctionDeclaration, Type } from "@google/genai";

// --- Configuration & Prompts ---

const getTextSystemInstruction = (language: string) => `
You are a helpful bilingual assistant.
Target Language: **${language}**.

**Instructions**:
1. **Primary Language**: Write your response in **${language}**.
2. **Grammar Help**: If the user makes a mistake (in English or ${language}), politely explain the correction in ${language}.
3. **Translations**: Always ensure the user understands.
4. **Special Rule**: If the user selects "English", communicate entirely in clear, natural English.

**Goal**: Help the user practice ${language} (or English) with confidence.
`;

const getLiveVoiceInstruction = (language: string) => `
System: You are a helpful voice assistant speaking ${language}.

Task:
1. Listen to the user.
2. Reply naturally in **${language}**.
3. Use the tool "provideBilingualDetails" to send the English translation of your reply.
`;

const explanationTool: FunctionDeclaration = {
  name: "provideBilingualDetails",
  description: "Provide the English translation of the conversation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      botTranslation: {
        type: Type.STRING,
        description: "English translation of the bot's spoken response."
      },
      userOriginal: {
        type: Type.STRING,
        description: "Transcript of what the user said (optional)."
      },
      userEnglishTranslation: {
        type: Type.STRING,
        description: "English translation of what the user said (optional)."
      }
    },
    required: ["botTranslation"]
  }
};

let chatSession: Chat | null = null;
let genAI: GoogleGenAI | null = null;

// --- Text Chat Service ---

export const initializeChatSession = (language: string = 'Hindi') => {
  if (!process.env.API_KEY) return;
  
  genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  chatSession = genAI.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: getTextSystemInstruction(language),
      temperature: 0.7,
    },
  });
};

export const sendMessageStream = async function* (message: string) {
  if (!chatSession) initializeChatSession('Hindi');
  if (!chatSession) throw new Error("Chat session not initialized");

  try {
    const resultStream = await chatSession.sendMessageStream({ message });
    for await (const chunk of resultStream) {
      const responseChunk = chunk as GenerateContentResponse;
      yield responseChunk.text;
    }
  } catch (error) {
    console.error("Text Error:", error);
    throw error;
  }
};

// --- Live Voice Client ---

export interface ExplanationData {
  botTranslation: string;
  userOriginal: string;
  userEnglishTranslation: string;
}

interface LiveClientCallbacks {
  onInputTranscription: (text: string) => void;
  onOutputTranscription: (text: string) => void;
  onExplanation: (data: ExplanationData) => void;
  onTurnComplete: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: Error) => void;
}

export class LiveClient {
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private session: LiveSession | null = null;
  private callbacks: LiveClientCallbacks;
  private isConnected: boolean = false;
  private language: string;

  constructor(callbacks: LiveClientCallbacks, language: string = 'Hindi') {
    this.callbacks = callbacks;
    this.language = language;
  }

  async connect() {
    if (!process.env.API_KEY) {
      this.callbacks.onError(new Error("API Key missing"));
      return;
    }

    try {
      // 1. Get Media Stream First (Permissions)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
      if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

      this.inputNode = this.inputAudioContext.createGain();
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 3. Connect to Gemini Live
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      this.session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Live Session Socket Open");
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message),
          onclose: () => {
             console.log("Live Session Closed");
             this.disconnect();
          },
          onerror: (e) => {
            console.error("Live API Error Event:", e);
            if (this.isConnected) {
                this.disconnect();
                this.callbacks.onError(new Error("Network error occurred"));
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getLiveVoiceInstruction(this.language),
          tools: [{ functionDeclarations: [explanationTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        }
      });

      this.isConnected = true;
      this.callbacks.onConnected();
      
      // 4. Start Streaming Audio (with slight delay for stability)
      setTimeout(() => {
          if (this.isConnected) this.startAudioStreaming();
      }, 500);

    } catch (error: any) {
      console.error("Connection Exception:", error);
      this.disconnect();
      this.callbacks.onError(error);
    }
  }

  private startAudioStreaming() {
    if (!this.inputAudioContext || !this.mediaStream || !this.session) return;

    try {
        this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
        this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          if (!this.isConnected || !this.session) return;
          
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = this.createBlob(inputData);
          
          try {
            this.session.sendRealtimeInput({ media: pcmBlob });
          } catch (e) {
            // Silently handle send errors (e.g. if socket closes mid-stream)
          }
        };

        this.source.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.inputAudioContext.destination);
    } catch (e) {
        console.error("Audio Stream Start Error:", e);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (!this.isConnected) return;

    try {
      // Handle Audio Output
      const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
      if (base64Audio && this.outputAudioContext && this.outputNode) {
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        try {
            const audioBuffer = await this.decodeAudioData(this.decode(base64Audio), this.outputAudioContext, 24000, 1);
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            source.addEventListener('ended', () => this.sources.delete(source));
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.sources.add(source);
        } catch (decodeErr) {
            console.error("Audio Decode Error", decodeErr);
        }
      }

      // Handle Transcriptions
      if (message.serverContent?.inputTranscription) {
        this.currentInputTranscription += message.serverContent.inputTranscription.text;
        this.callbacks.onInputTranscription(this.currentInputTranscription);
      }
      
      if (message.serverContent?.outputTranscription) {
        this.currentOutputTranscription += message.serverContent.outputTranscription.text;
        this.callbacks.onOutputTranscription(this.currentOutputTranscription);
      }

      // Handle Tool Calls
      if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
          if (fc.name === 'provideBilingualDetails') {
            const args = fc.args as any;
            const explanationData: ExplanationData = {
                botTranslation: args.botTranslation || '',
                userOriginal: args.userOriginal || '',
                userEnglishTranslation: args.userEnglishTranslation || ''
            };
            
            this.callbacks.onExplanation(explanationData);
            
            if (this.session) {
                try {
                    this.session.sendToolResponse({
                      functionResponses: [{
                        id: fc.id,
                        name: fc.name,
                        response: { result: "ok" }
                      }]
                    });
                } catch (e) { }
            }
          }
        }
      }

      if (message.serverContent?.turnComplete) {
        this.callbacks.onTurnComplete();
        this.currentInputTranscription = '';
        this.currentOutputTranscription = '';
      }

      if (message.serverContent?.interrupted) {
        this.sources.forEach(src => {
            try { src.stop(); } catch (e) {}
        });
        this.sources.clear();
        this.nextStartTime = 0;
        this.currentOutputTranscription = '';
      }
    } catch (e) {
      console.error("Msg Error:", e);
    }
  }

  disconnect() {
    this.isConnected = false;
    
    try {
      // 1. Close Session
      if (this.session) {
        try {
            this.session.close();
        } catch (e) { }
        this.session = null;
      }

      // 2. Stop User Media
      this.mediaStream?.getTracks().forEach(track => track.stop());
      this.source?.disconnect();
      if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
      }
      
      // 3. Close Audio Contexts
      const closeContext = async (ctx: AudioContext | null) => {
          if (ctx && ctx.state !== 'closed') {
              try { await ctx.close(); } catch (e) { }
          }
      };
      closeContext(this.inputAudioContext);
      closeContext(this.outputAudioContext);
      
    } catch (e) {
      console.error("Disconnect cleanup error", e);
    }
    
    this.callbacks.onDisconnected();
    
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.mediaStream = null;
    this.source = null;
    this.scriptProcessor = null;
  }

  private createBlob(data: Float32Array): any {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return { data: this.encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let c = 0; c < numChannels; c++) {
      const cd = buffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) cd[i] = dataInt16[i * numChannels + c] / 32768.0;
    }
    return buffer;
  }
}