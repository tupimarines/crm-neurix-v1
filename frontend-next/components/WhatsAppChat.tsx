"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface WhatsAppMessage {
    id: string;
    messageid?: string;
    content: any;
    body?: string;
    text?: string;
    messageType: string;
    status: string;
    owner: string;
    messageTimestamp: number;
    fromMe?: boolean;
    key?: {
        fromMe: boolean;
        id: string;
    };
    pushName?: string;
}

interface WhatsAppChatProps {
    leadId: string;
    leadName: string;
    onClose: () => void;
}

export default function WhatsAppChat({ leadId, leadName, onClose }: WhatsAppChatProps) {
    const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    useEffect(() => {
        loadHistory();
    }, [leadId]);

    useEffect(() => {
        // Scroll to bottom when messages load
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "auto" });
        }
    }, [messages]);

    async function loadHistory() {
        setLoading(true);
        setError("");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) throw new Error("Não autenticado");

            const res = await fetch(`${API_URL}/api/leads/${leadId}/chat-history`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Erro ao carregar histórico");
            }

            const data = await res.json();
            const msgs = data.messages || [];
            if (msgs.length > 1 && msgs[0].messageTimestamp > msgs[msgs.length - 1].messageTimestamp) {
                msgs.reverse();
            }
            setMessages(msgs);
        } catch (err: any) {
            console.error("Erro ao carregar chat:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!inputText.trim() || sending) return;

        setSending(true);
        const textToSend = inputText;
        setInputText("");

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`${API_URL}/api/leads/${leadId}/messages/send`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ text: textToSend })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Erro ao enviar mensagem");
            }

            // Reload history to show the new message
            await loadHistory();
        } catch (err: any) {
            console.error("Erro ao enviar:", err);
            alert(err.message);
            setInputText(textToSend); // Restore input on error
        } finally {
            setSending(false);
        }
    }

    const formatTime = (ts: number | string) => {
        if (!ts) return "";
        const date = new Date(Number(ts));
        if (ts.toString().length <= 10) date.setTime(Number(ts) * 1000); // mostly uazapi timestamp is seconds
        return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const getMessageText = (msg: WhatsAppMessage) => {
        if (msg.text) return msg.text;
        if (msg.body) return msg.body;
        if (typeof msg.content === 'string') return msg.content;
        if (msg.content && msg.content.text) return msg.content.text;
        return `[${msg.messageType || "Mensagem"}]`;
    };

    const isFromMe = (msg: WhatsAppMessage) => {
        if (msg.fromMe !== undefined) return msg.fromMe;
        if (msg.key && msg.key.fromMe !== undefined) return msg.key.fromMe;
        return msg.id?.startsWith("owner") || false;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-[#EFEAE2] dark:bg-[#111B21] w-full max-w-2xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative border border-border-light dark:border-border-dark">

                {/* Header */}
                <div className="bg-[#F0F2F5] dark:bg-[#202C33] px-4 py-3 flex items-center justify-between border-b border-[#D1D7DB] dark:border-[#2A3942]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                            <span className="material-symbols-outlined text-slate-400 dark:text-slate-300">person</span>
                        </div>
                        <div>
                            <h3 className="font-semibold text-[#111B21] dark:text-[#E9EDEF] leading-tight truncate">{leadName}</h3>
                            <p className="text-xs text-[#667781] dark:text-[#8696A0]">Toque para ver os detalhes do lead</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#D1D7DB] dark:hover:bg-[#374045] rounded-full transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#EFEAE2] dark:bg-[#0B141A] relative" style={{ backgroundImage: "none" }}>
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <span className="text-sm bg-white dark:bg-[#182229] px-4 py-2 rounded-lg shadow-sm text-text-secondary-light">Carregando histórico...</span>
                        </div>
                    ) : error ? (
                        <div className="flex justify-center py-10">
                            <span className="text-sm bg-red-100 text-red-600 px-4 py-2 rounded-lg shadow-sm">{error}</span>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex justify-center py-10">
                            <span className="text-sm bg-[#FFEECD] dark:bg-[#182229] text-[#54656F] dark:text-[#8696A0] px-4 py-2 rounded-lg shadow-sm text-center">
                                Nenhuma mensagem encontrada com este contato.
                            </span>
                        </div>
                    ) : (
                        messages.map((msg, i) => {
                            const me = isFromMe(msg);
                            return (
                                <div key={msg.id || i} className={`flex ${me ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${me ? "bg-[#D9FDD3] dark:bg-[#005C4B] rounded-tr-none" : "bg-white dark:bg-[#202C33] rounded-tl-none"}`}>
                                        <div className="text-[14px] text-[#111B21] dark:text-[#E9EDEF] whitespace-pre-wrap word-break">
                                            {getMessageText(msg)}
                                        </div>
                                        <div className="text-[10px] text-[#667781] dark:text-[#8696A0] text-right mt-1 ml-4 flex justify-end items-center gap-1 opacity-80">
                                            {formatTime(msg.messageTimestamp)}
                                            {me && <span className="material-symbols-outlined text-[14px]">done_all</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSend} className="bg-[#F0F2F5] dark:bg-[#202C33] px-4 py-3 flex items-end gap-2">
                    <button type="button" className="p-2 text-[#54656F] dark:text-[#8696A0] hover:bg-[#D1D7DB] dark:hover:bg-[#374045] rounded-full shrink-0 flex items-center justify-center">
                        <span className="material-symbols-outlined">attach_file</span>
                    </button>
                    <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-xl overflow-hidden shadow-sm flex items-end border border-transparent focus-within:border-primary/30">
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e);
                                }
                            }}
                            placeholder="Digite uma mensagem..."
                            className="w-full max-h-32 bg-transparent text-[15px] leading-[20px] py-[10px] px-4 resize-none focus:outline-none dark:text-white"
                            rows={1}
                            style={{ minHeight: "44px" }}
                        />
                    </div>
                    {inputText.trim() ? (
                        <button
                            type="submit"
                            disabled={sending}
                            className="w-10 h-10 mb-0.5 bg-[#00A884] hover:bg-[#008f6f] text-white rounded-full flex items-center justify-center shrink-0 transition-colors shadow-sm disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[20px]">{sending ? "hourglass_empty" : "send"}</span>
                        </button>
                    ) : (
                        <button type="button" className="p-2 mb-0.5 text-[#54656F] dark:text-[#8696A0] hover:bg-[#D1D7DB] dark:hover:bg-[#374045] rounded-full shrink-0 flex items-center justify-center">
                            <span className="material-symbols-outlined">mic</span>
                        </button>
                    )}
                </form>

            </div>
        </div>
    );
}
