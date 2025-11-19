import React, { useState, useEffect, useRef } from 'react';
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput';
import { ChatMessage, Role } from './types';
import { sendMessageStream, LiveClient, initializeChatSession, ExplanationData } from './services/geminiService';
import { GraduationCap, Mic, Download, Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Hindi', label: 'Hindi (हिंदी)' },
  { code: 'Bhojpuri', label: 'Bhojpuri (भोजपुरी)' },
  { code: 'Spanish', label: 'Spanish (Español)' },
  { code: 'French', label: 'French (Français)' },
  { code: 'German', label: 'German (Deutsch)' },
  { code: 'Japanese', label: 'Japanese (日本語)' },
  { code: 'Portuguese', label: 'Portuguese (Português)' },
  { code: 'Chinese', label: 'Chinese (中文)' },
  { code: 'Russian', label: 'Russian (Русский)' },
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('Hindi');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveClientRef = useRef<LiveClient | null>(null);
  const currentLiveUserMsgId = useRef<string | null>(null);
  const currentLiveModelMsgId = useRef<string | null>(null);
  
  // Live data tracking
  const currentTurnData = useRef<{
    englishBot: string, 
    explanationBot: string,
    userOriginal: string,
    userEnglish: string
  }>({ 
    englishBot: '', 
    explanationBot: '',
    userOriginal: '',
    userEnglish: ''
  });

  useEffect(() => {
    initializeChatSession(selectedLanguage);
    setMessages([{
      id: 'welcome',
      role: Role.MODEL,
      text: `Hello! I'm your Language Coach.
      
I will speak and reply in **${selectedLanguage}** (unless you choose English).
Select your preferred language from the menu!`,
      timestamp: new Date()
    }]);
  }, []); 

  useEffect(() => {
    initializeChatSession(selectedLanguage);
  }, [selectedLanguage]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isLive]);

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: text,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const botMsgId = (Date.now() + 1).toString();
      const initialBotMsg: ChatMessage = {
        id: botMsgId,
        role: Role.MODEL,
        text: '',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, initialBotMsg]);

      let fullResponseText = '';
      const stream = sendMessageStream(text);
      
      for await (const chunk of stream) {
        if (chunk) {
          fullResponseText += chunk;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === botMsgId ? { ...msg, text: fullResponseText } : msg
            )
          );
        }
      }

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: Role.MODEL,
        text: "I'm having trouble connecting right now. Please check your internet connection or API Key.",
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLiveMode = async () => {
    if (isLive) {
      // Stop Live Mode
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
        liveClientRef.current = null;
      }
      setIsLive(false);
      resetTurnData();
    } else {
      // Start Live Mode
      setIsLive(true);
      resetTurnData();
      
      liveClientRef.current = new LiveClient({
        onConnected: () => {
          console.log('Live session connected');
        },
        onInputTranscription: (text) => {
           handleLiveInput(text);
        },
        onOutputTranscription: (text) => {
           currentTurnData.current.englishBot = text;
           updateLiveModelMessage();
        },
        onExplanation: (data: ExplanationData) => {
           // Store the English translation of Bot's speech
           currentTurnData.current.explanationBot = data.botTranslation;
           
           // If we got user details, update the user bubble
           if (data.userOriginal) {
             currentTurnData.current.userOriginal = data.userOriginal;
             currentTurnData.current.userEnglish = data.userEnglishTranslation;
             updateLiveUserMessage(true); 
           }
           updateLiveModelMessage();
        },
        onTurnComplete: () => {
           currentLiveUserMsgId.current = null;
           currentLiveModelMsgId.current = null;
           resetTurnData();
        },
        onDisconnected: () => {
          setIsLive(false);
        },
        onError: (error) => {
          console.error("Live Client Error:", error);
          if (liveClientRef.current) {
              liveClientRef.current.disconnect();
              liveClientRef.current = null;
          }
          setIsLive(false);
          
          const errorMsg: ChatMessage = {
            id: Date.now().toString(),
            role: Role.MODEL,
            text: "Connection error with Voice Mode. Please try again.",
            timestamp: new Date(),
            isError: true
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      }, selectedLanguage);

      await liveClientRef.current.connect();
    }
  };

  const resetTurnData = () => {
    currentTurnData.current = { 
      englishBot: '', 
      explanationBot: '', 
      userOriginal: '', 
      userEnglish: '' 
    };
  };

  const handleLiveInput = (text: string) => {
    // Initial basic update while speaking
    currentTurnData.current.userOriginal = text;
    updateLiveUserMessage(false);
  };

  const updateLiveUserMessage = (hasTranslation: boolean) => {
    const { userOriginal, userEnglish } = currentTurnData.current;
    let displayText = userOriginal;
    
    if (hasTranslation && userEnglish) {
      displayText = `${userOriginal}\n\n🇬🇧 ${userEnglish}`;
    }

    setMessages(prev => {
      if (currentLiveUserMsgId.current) {
        return prev.map(msg => 
          msg.id === currentLiveUserMsgId.current ? { ...msg, text: displayText } : msg
        );
      }
      const newId = Date.now().toString();
      currentLiveUserMsgId.current = newId;
      return [...prev, {
        id: newId,
        role: Role.USER,
        text: displayText,
        timestamp: new Date()
      }];
    });
  };

  const updateLiveModelMessage = () => {
    const { englishBot, explanationBot } = currentTurnData.current;
    // englishBot here is actually the "Spoken Transcript" which is in [Selected Language]
    
    let displayText = englishBot;
    
    if (englishBot && explanationBot) {
       // Show [Selected Language Text] + [English Translation]
      displayText = `${englishBot}\n\n🇬🇧 ${explanationBot}`;
    } else if (explanationBot) {
      displayText = `🇬🇧 ${explanationBot}`;
    }

    setMessages(prev => {
      if (currentLiveModelMsgId.current) {
        return prev.map(msg => 
          msg.id === currentLiveModelMsgId.current ? { ...msg, text: displayText } : msg
        );
      }
      const newId = (Date.now() + 1).toString();
      currentLiveModelMsgId.current = newId;
      return [...prev, {
        id: newId,
        role: Role.MODEL,
        text: displayText,
        timestamp: new Date()
      }];
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl text-white transition-colors ${isLive ? 'bg-red-500 animate-pulse' : 'bg-indigo-600'}`}>
              {isLive ? <Mic size={20} /> : <GraduationCap size={20} />}
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg text-slate-800 leading-tight">LinguaFriend</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <button 
                onClick={() => !isLive && setShowLangMenu(!showLangMenu)}
                disabled={isLive}
                className={`flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium transition-colors ${isLive ? 'opacity-50 cursor-not-allowed text-slate-400' : 'hover:bg-slate-200 text-slate-700'}`}
              >
                <Globe size={16} />
                <span className="hidden xs:inline">{selectedLanguage}</span>
              </button>

              {showLangMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 max-h-64 overflow-y-auto z-50">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setSelectedLanguage(lang.code);
                        setShowLangMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 ${selectedLanguage === lang.code ? 'text-indigo-600 font-semibold' : 'text-slate-600'}`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Install Button */}
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Install App"
              >
                <Download size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          
          {isLoading && messages[messages.length - 1]?.role === Role.USER && (
            <div className="flex justify-start mb-6">
              <div className="flex items-end gap-2">
                 <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center mb-1 shadow-sm">
                   <GraduationCap size={16} />
                 </div>
                 <div className="px-4 py-3 bg-white rounded-2xl rounded-bl-none border border-slate-100 shadow-sm flex gap-1">
                   <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                   <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                   <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm pt-2">
        <ChatInput 
          onSend={handleSendMessage} 
          onToggleLive={toggleLiveMode}
          isLiveActive={isLive}
          isLoading={isLoading} 
        />
      </footer>
    </div>
  );
}