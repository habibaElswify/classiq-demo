'use client';

import { useState, FormEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Attach button (decorative) */}
        <button
          type="button"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-[#5D3FD3] hover:bg-[#5D3FD3]/10 transition-colors"
          aria-label="Attach file"
          tabIndex={-1}
        >
          <span className="text-lg">&#128206;</span>
        </button>

        {/* Text input */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask ClassIQ a question..."
          disabled={disabled}
          className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-[#5D3FD3] focus:ring-2 focus:ring-[#5D3FD3]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[#5D3FD3] text-white hover:bg-[#4D2FC3] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <span className="text-sm">&#10148;</span>
        </button>
      </form>

      {/* Footer text */}
      <p className="text-center text-xs text-gray-400 mt-2">
        ClassIQ references only your uploaded course materials &bull; FERPA compliant
      </p>
    </div>
  );
}
