import React from 'react';
import { Monitor, Terminal, Cpu, Key, ArrowRight } from 'lucide-react';

export const BrowserFallback: React.FC = () => {
    return (
        <div className="min-h-screen bg-[#0b0c10] text-[#c5c6c7] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Ambient background glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#66fcf1]/5 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#45f3ff]/5 rounded-full blur-[120px]" />

            <div className="w-full max-w-2xl bg-[#1f2833]/40 backdrop-blur-xl border border-[#ffffff]/10 rounded-2xl p-8 md:p-12 shadow-2xl relative z-10 flex flex-col items-center text-center">
                
                {/* Logo & Icon Header */}
                <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#1f2833] to-[#0b0c10] border border-[#66fcf1]/30 flex items-center justify-center shadow-lg shadow-[#66fcf1]/10">
                        <Monitor size={40} className="text-[#66fcf1]" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider">
                        Browser Fallback
                    </div>
                </div>

                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3">
                    Natively AI Assistant
                </h1>
                
                <p className="text-sm md:text-base text-[#45f3ff] font-medium tracking-wide uppercase mb-6">
                    Desktop Environment Required
                </p>

                <div className="w-full max-w-lg text-sm text-[#8b949e] leading-relaxed mb-8">
                    Natively leverages deep operating system APIs—including system-wide global shortcuts, screen capturing, system-audio routing, and native keystroke generation—which are blocked or unavailable in traditional web browsers.
                </div>

                {/* Instructions Section */}
                <div className="w-full text-left space-y-4 mb-8">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2 border-b border-[#ffffff]/10 pb-2">
                        How to Launch Natively
                    </h3>

                    <div className="flex gap-4 items-start bg-[#0b0c10]/40 p-4 rounded-xl border border-[#ffffff]/5 hover:border-[#66fcf1]/20 transition-all duration-300">
                        <div className="w-7 h-7 rounded-lg bg-[#66fcf1]/10 border border-[#66fcf1]/20 flex items-center justify-center text-[#66fcf1] shrink-0 font-bold text-xs">
                            1
                        </div>
                        <div>
                            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-1">Open Terminal</h4>
                            <p className="text-xs text-[#8b949e]">Navigate to your project root folder:</p>
                            <code className="block bg-[#0b0c10] border border-[#ffffff]/5 rounded p-2 text-[10.5px] font-mono text-[#66fcf1] mt-2 select-all">
                                cd e:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main
                            </code>
                        </div>
                    </div>

                    <div className="flex gap-4 items-start bg-[#0b0c10]/40 p-4 rounded-xl border border-[#ffffff]/5 hover:border-[#66fcf1]/20 transition-all duration-300">
                        <div className="w-7 h-7 rounded-lg bg-[#66fcf1]/10 border border-[#66fcf1]/20 flex items-center justify-center text-[#66fcf1] shrink-0 font-bold text-xs">
                            2
                        </div>
                        <div className="w-full">
                            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-1">Install Dependencies</h4>
                            <p className="text-xs text-[#8b949e]">Ensure all node modules and packaging libraries are installed:</p>
                            <code className="block bg-[#0b0c10] border border-[#ffffff]/5 rounded p-2 text-[10.5px] font-mono text-[#66fcf1] mt-2 select-all">
                                npm install
                            </code>
                        </div>
                    </div>

                    <div className="flex gap-4 items-start bg-[#0b0c10]/40 p-4 rounded-xl border border-[#ffffff]/5 hover:border-[#66fcf1]/20 transition-all duration-300">
                        <div className="w-7 h-7 rounded-lg bg-[#66fcf1]/10 border border-[#66fcf1]/20 flex items-center justify-center text-[#66fcf1] shrink-0 font-bold text-xs">
                            3
                        </div>
                        <div className="w-full">
                            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-1">Run Desktop App</h4>
                            <p className="text-xs text-[#8b949e]">Start the Electron client build and run the desktop app natively:</p>
                            <code className="block bg-[#0b0c10] border border-[#ffffff]/5 rounded p-2 text-[10.5px] font-mono text-[#66fcf1] mt-2 select-all">
                                npm run start
                            </code>
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="text-[11px] text-[#5c646d] flex items-center gap-1.5 justify-center">
                    <Cpu size={12} />
                    <span>Natively AI Assistant (Electron Wrapper v1.0.0)</span>
                </div>
            </div>
        </div>
    );
};
