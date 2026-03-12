'use client';

import { useState } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp?: string;
  userName?: string;
  blocked?: boolean;
  onFeedback?: (helpful: boolean) => void;
  onFollowUp?: (question: string) => void;
}

const followUpSuggestions = [
  'Can you explain that in simpler terms?',
  'What are the key takeaways?',
  'Can you give me an example?',
];

function renderContent(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-[#5D3FD3] font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
}

export default function ChatMessage({
  role,
  content,
  sources,
  timestamp,
  userName,
  blocked,
  onFeedback,
  onFollowUp,
}: ChatMessageProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);

  const handleFeedback = (helpful: boolean) => {
    setFeedbackGiven(helpful);
    onFeedback?.(helpful);
  };

  // Blocked message style
  if (blocked) {
    return (
      <div className="flex justify-start mb-4 px-4">
        <div className="max-w-[75%] rounded-lg px-4 py-3 bg-amber-50 border-l-4 border-orange-400">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-orange-500 text-sm font-medium">&#9888; Content Notice</span>
          </div>
          <p className="text-sm text-orange-800">{renderContent(content)}</p>
          {timestamp && (
            <p className="text-xs text-orange-400 mt-1">{formatTime(timestamp)}</p>
          )}
        </div>
      </div>
    );
  }

  // User message
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4 px-4">
        <div className="max-w-[75%]">
          <div className="rounded-2xl rounded-br-sm px-4 py-3 bg-gradient-to-r from-[#5D3FD3] to-[#7C5FE8] text-white">
            <p className="text-sm">{renderContent(content)}</p>
          </div>
          <div className="flex justify-end items-center gap-2 mt-1">
            {userName && (
              <span className="text-xs text-gray-400">{userName}</span>
            )}
            {timestamp && (
              <span className="text-xs text-gray-400">{formatTime(timestamp)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4 px-4">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-white border border-gray-200">
          <p className="text-sm text-gray-800 leading-relaxed">{renderContent(content)}</p>
        </div>

        {/* Source citations */}
        {sources && sources.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {sources.map((source, i) => (
              <p key={i} className="text-xs text-gray-500">
                <span role="img" aria-label="paperclip">&#128206;</span> Source: [{source}]
              </p>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <p className="text-xs text-gray-400 mt-1">{formatTime(timestamp)}</p>
        )}

        {/* Feedback row */}
        {onFeedback && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-400">Was this helpful?</span>
            <button
              onClick={() => handleFeedback(true)}
              className={`text-sm transition-transform hover:scale-110 ${
                feedbackGiven === true ? 'opacity-100' : 'opacity-50 hover:opacity-100'
              }`}
              disabled={feedbackGiven !== null}
              aria-label="Helpful"
            >
              &#128077;
            </button>
            <button
              onClick={() => handleFeedback(false)}
              className={`text-sm transition-transform hover:scale-110 ${
                feedbackGiven === false ? 'opacity-100' : 'opacity-50 hover:opacity-100'
              }`}
              disabled={feedbackGiven !== null}
              aria-label="Not helpful"
            >
              &#128078;
            </button>
          </div>
        )}

        {/* Follow-up chips */}
        {onFollowUp && (
          <div className="flex flex-wrap gap-2 mt-3">
            {followUpSuggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(q)}
                className="text-xs px-3 py-1.5 rounded-full bg-[#5D3FD3]/10 text-[#5D3FD3] hover:bg-[#5D3FD3]/20 transition-colors border border-[#5D3FD3]/20"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
