import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff, AudioLines } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onToggleLive: () => void;
  isLiveActive: boolean;
  isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onToggleLive, isLiveActive, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !isLoading && !isLiveActive) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {isLiveActive && (
        <div className="mb-4 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 text-indigo-800">
             <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
              </div>
              <span className="font-medium">Listening & Speaking...</span>
          </div>
          <AudioLines className="text-indigo-400 animate-pulse" size={24} />
        </div>
      )}

      <div className="relative flex items-end gap-2 bg-white p-2 rounded-3xl shadow-lg border border-slate-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLiveActive ? "Voice mode active..." : "Type a message..."}
          className={`w-full py-3 px-4 bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 resize-none max-h-[120px] overflow-y-auto rounded-2xl ${isLiveActive ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows={1}
          disabled={isLoading || isLiveActive}
        />
        
        {/* Live Voice Toggle */}
        <button
          type="button"
          onClick={onToggleLive}
          className={`mb-1 p-3 rounded-full flex items-center justify-center transition-all duration-200
            ${isLiveActive 
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse shadow-red-200' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            } shadow-md`}
          title={isLiveActive ? "End Voice Call" : "Start Voice Call"}
        >
          {isLiveActive ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Send Text Button */}
        {!isLiveActive && (
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading}
            className={`mb-1 p-3 rounded-full flex items-center justify-center transition-all duration-200
              ${!input.trim() || isLoading 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 shadow-md'
              }`}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        )}
      </div>
      <p className="text-center text-xs text-slate-400 mt-2">
        AI Coach can make mistakes. Practice makes perfect!
      </p>
    </div>
  );
};