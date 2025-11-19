import React from 'react';
import { ChatMessage, Role } from '../types';
import { Bot, User, AlertCircle } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === Role.USER;
  const isError = message.isError;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mb-1 shadow-sm
          ${isUser ? 'bg-indigo-600 text-white' : isError ? 'bg-red-100 text-red-600' : 'bg-emerald-600 text-white'}`}>
          {isUser ? <User size={16} /> : isError ? <AlertCircle size={16} /> : <Bot size={16} />}
        </div>

        {/* Bubble */}
        <div 
          className={`px-4 py-3 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-br-none' 
              : isError
                ? 'bg-red-50 text-red-800 border border-red-200 rounded-bl-none'
                : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
            }`}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
};