import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles, Filter, Database, ChevronDown, Check } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Welcome! This is the implementation of the flexible layout. The content area above is scrollable, while the controls below (filter, dropdown, input box, and buttons) are anchored to the bottom.",
  },
  {
    id: "2",
    role: "user",
    content: "Does it support long messages without pushing the input bar off-screen?",
  },
  {
    id: "3",
    role: "assistant",
    content: "Absolutely! Go ahead and click the 'Simulate Large Response' button to generate text. You will see that the content scrolls cleanly within its boundaries, keeping the footer visible at all times.",
  },
];

export const ChatLayout: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [activeFilter, setActiveFilter] = useState("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages list grows
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `I received your message: "${userMsg.content}". This is a dynamically generated response to demonstrate scrollable container behavior.`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }, 600);
  };

  const handleSimulateLargeResponse = () => {
    const largeContent: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: `Here is a large block of generated text to test overflow-y: auto: \n\n${Array(5)
        .fill(
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
        )
        .join("\n\n")}`,
    };
    setMessages((prev) => [...prev, largeContent]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  return (
    <div
      className="w-full max-w-2xl mx-auto bg-black text-[#F3F4F6] border border-white/10 rounded-[28px] shadow-2xl relative"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      
      {/* ── Fixed Header ── */}
      <header className="flex-none flex items-center justify-between px-6 py-4 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
          <h1 className="text-sm font-bold tracking-tight text-white/90">Assistant Layout Panel</h1>
        </div>
        <button
          onClick={handleSimulateLargeResponse}
          className="text-[11px] font-semibold bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 border border-indigo-500/20 px-3 py-1.5 rounded-full transition-all duration-200"
        >
          Simulate Large Response
        </button>
      </header>

      {/* ── Scrollable Messages Container (The dynamic scroll area) ── */}
      <main
        className="px-6 py-4 space-y-4 custom-scrollbar bg-gradient-to-b from-indigo-950/5 to-transparent min-h-0"
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}
          >
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-line shadow-sm border ${
                msg.role === "user"
                  ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-100 rounded-tr-sm"
                  : "bg-zinc-900/60 border-white/5 text-zinc-100 rounded-tl-sm"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest">
                  <Sparkles size={11} />
                  <span>Assistant</span>
                </div>
              )}
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* ── Fixed Footer Controls (Anchored at the bottom) ── */}
      <footer
        className="p-5 bg-zinc-950/90 border-t border-white/5 backdrop-blur-md z-10 space-y-4"
        style={{
          flexShrink: 0,
        }}
      >
        
        {/* Dropdown and Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Model Selector Dropdown */}
          <div className="relative flex items-center gap-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Model:</span>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-200 text-xs px-3 py-1.5 pr-8 rounded-lg cursor-pointer transition-all outline-none"
              >
                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                <option value="gemini-3.5-pro">Gemini 3.5 Pro</option>
                <option value="ollama-local">Ollama (Local)</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mr-1">Filter:</span>
            {["all", "code", "text"].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all duration-150 capitalize ${
                  activeFilter === filter
                    ? "bg-zinc-800 border-zinc-700 text-white"
                    : "border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

        </div>

        {/* Input Box and Primary Action Row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the assistant anything..."
              className="w-full bg-zinc-900/80 border border-white/10 focus:border-indigo-500/50 text-[#F3F4F6] placeholder-zinc-500 text-sm px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            className={`flex items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              inputValue.trim()
                ? "bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-[1.02]"
                : "bg-zinc-900 border border-white/5 text-zinc-500 cursor-not-allowed"
            }`}
          >
            <ArrowUp size={18} />
          </button>
        </div>

      </footer>
    </div>
  );
};

export default ChatLayout;
