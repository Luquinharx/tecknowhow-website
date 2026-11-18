import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { logEvent } from "firebase/analytics";
import { db, analytics } from "@/lib/firebase";
import { ArrowUp, ChevronDown, MessageCircle, RotateCcw, Phone, CheckCircle2, X, ClipboardList, Hammer, CalendarCheck } from "lucide-react";
import teckaAvatar from "@/assets/tecka-avatar.jpg";

const WHATSAPP_NUMBER = "351913503036";
const PHONE_DISPLAY = "+351 913 503 036";
const STORAGE_KEY = "tkh-chat-v3";

type Lead = { nome: string; telemovel: string; servico: string; localizacao: string; prazo: string; resumo: string };

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string; // texto visível
  raw?: string; // texto original com marcadores (enviado de volta ao modelo)
  options?: string[];
  handoff?: boolean;
  lead?: Lead;
  error?: boolean;
};

const SUGGESTIONS = [
  { label: "Pedir orçamento", message: "Gostaria de pedir um orçamento", icon: ClipboardList },
  { label: "Remodelação", message: "Quero fazer uma remodelação", icon: Hammer },
  { label: "Visita técnica", message: "Quero agendar uma visita técnica", icon: CalendarCheck },
];

const greeting = (): Msg => {
  const h = new Date().getHours();
  const hello = h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite";
  return {
    id: "welcome",
    role: "assistant",
    content: `${hello}! Sou a **Tecka**, a assistente virtual da TecKnowHow.\nPosso esclarecer dúvidas sobre os nossos serviços e preparar o seu pedido de orçamento. Em que posso ajudar?`,
  };
};

const uid = () => Math.random().toString(36).slice(2, 10);

const track = (name: string, params?: Record<string, string | number>) => {
  try {
    logEvent(analytics, name, params);
  } catch {
    /* analytics indisponível */
  }
};

const waLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

// --- Interpretação dos marcadores enviados pelo modelo ---
function parseReply(full: string) {
  let text = full;
  let lead: Lead | undefined;
  let options: string[] | undefined;

  const leadMatch = text.match(/\[\[LEAD\]\]([\s\S]*?)\[\[\/LEAD\]\]/);
  if (leadMatch) {
    try {
      const data = JSON.parse(leadMatch[1].trim());
      const phoneDigits = String(data.telemovel || "").replace(/\D/g, "");
      if (data.nome && phoneDigits.length >= 9) {
        lead = {
          nome: String(data.nome).trim(),
          telemovel: String(data.telemovel).trim(),
          servico: String(data.servico || "").trim(),
          localizacao: String(data.localizacao || "").trim(),
          prazo: String(data.prazo || "").trim(),
          resumo: String(data.resumo || "").trim(),
        };
      }
    } catch {
      /* JSON inválido: ignora */
    }
    text = text.replace(leadMatch[0], "");
  }

  const optMatch = text.match(/\[\[OPCOES:([^\]]*)\]\]/);
  if (optMatch) {
    options = optMatch[1]
      .split("|")
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 4);
    text = text.replace(optMatch[0], "");
  }

  const handoff = text.includes("[[ESPECIALISTA]]");
  text = text
    .replace(/\[\[ESPECIALISTA\]\]/g, "")
    .replace(/\[\[[\s\S]*$/, "") // marcador ainda incompleto durante o streaming
    .replace(/\[$/, "")
    .trim();

  return { text, lead, options, handoff: handoff && !lead };
}

// --- Markdown leve: **negrito**, listas, links e quebras de linha ---
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|geral@tecknowhow\.pt)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part) || part === "geral@tecknowhow.pt")
      return (
        <a
          key={i}
          href={part.includes("@") ? `mailto:${part}` : part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 font-medium"
        >
          {part}
        </a>
      );
    return part;
  });
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1 space-y-0.5 pl-4 list-disc marker:text-primary">
        {list.map((li, i) => (
          <li key={i}>{renderInline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  text.split("\n").forEach((line) => {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (m) return void list.push(m[1]);
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{renderInline(line)}</p>);
  });
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

// --- Avatar: foto da assistente (imagem gerada por IA) ---
const EngineerAvatar = ({ className = "" }: { className?: string }) => (
  <img src={teckaAvatar} alt="Tecka, assistente TecKnowHow" className={`object-cover ${className}`} draggable={false} />
);

const Avatar = ({ size = "sm" }: { size?: "sm" | "lg" }) => (
  <div className={`${size === "lg" ? "w-11 h-11" : "w-7 h-7"} shrink-0 rounded-full ring-2 ring-white shadow-md shadow-orange-500/20 overflow-hidden`}>
    <EngineerAvatar className="w-full h-full" />
  </div>
);

const TypingDots = () => (
  <div className="flex gap-1 px-1 py-1.5">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-gray-400"
        animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
      />
    ))}
  </div>
);

// --- Cartão final com o resumo do pedido + contacto direto ---
function LeadCard({ lead }: { lead: Lead }) {
  const rows = [
    ["Serviço", lead.servico],
    ["Local", lead.localizacao],
    ["Prazo", lead.prazo],
    ["Contacto", `${lead.nome} · ${lead.telemovel}`],
  ].filter(([, v]) => v);

  const message = [
    `Olá, o meu nome é ${lead.nome}.`,
    `Telemóvel: ${lead.telemovel}`,
    lead.servico && `Serviço: ${lead.servico}`,
    lead.localizacao && `Local: ${lead.localizacao}`,
    lead.prazo && `Prazo: ${lead.prazo}`,
    lead.resumo && `Pedido: ${lead.resumo}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="ml-9 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={15} /> Pedido registado
      </div>
      <dl className="space-y-1.5 px-4 py-3 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-16 shrink-0 text-gray-400">{k}</dt>
            <dd className="text-gray-700 font-medium break-words min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-4 pb-4">
        <a
          href={waLink(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("chat_whatsapp_click", { origem: "lead" })}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5b] py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/20 transition hover:-translate-y-0.5"
        >
          <MessageCircle size={16} /> Continuar no WhatsApp
        </a>
        <a
          href={`tel:+${WHATSAPP_NUMBER}`}
          onClick={() => track("chat_call_click")}
          className="flex items-center justify-center rounded-xl border border-gray-200 px-3 text-gray-600 hover:border-primary hover:text-primary transition"
          aria-label={`Ligar ${PHONE_DISPLAY}`}
          title={`Ligar ${PHONE_DISPLAY}`}
        >
          <Phone size={16} />
        </a>
      </div>
    </motion.div>
  );
}

async function saveLead(lead: Lead) {
  try {
    const snapshot = await getDocs(query(collection(db, "leads"), where("phone", "==", lead.telemovel)));
    if (!snapshot.empty) return;
    await addDoc(collection(db, "leads"), {
      firstName: lead.nome,
      phone: lead.telemovel,
      interest: lead.resumo || lead.servico,
      service: lead.servico,
      location: lead.localizacao,
      timeline: lead.prazo,
      source: "chatbot",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
  }
}

const WhatsAppChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignora */
    }
    return [greeting()];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => !m.error)));
    } catch {
      /* ignora */
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!isOpen) return;
    setUnread(false);
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Bloqueia o scroll da página no telemóvel quando o chat está em ecrã inteiro
  useEffect(() => {
    if (!isOpen || window.innerWidth >= 640) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || loading) return;
      setInput("");

      const userMsg: Msg = { id: uid(), role: "user", content };
      const botId = uid();
      const history = [...messages.filter((m) => !m.error && m.id !== "welcome"), userMsg];
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      track(history.length === 1 ? "chat_conversation_start" : "chat_message_sent");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.raw ?? m.content })) }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let started = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          const { text: visible } = parseReply(full);
          if (!started && visible) {
            started = true;
            setLoading(false);
            setMessages((prev) => [...prev, { id: botId, role: "assistant", content: visible }]);
          } else if (started) {
            setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, content: visible } : m)));
          }
        }

        const parsed = parseReply(full);
        const finalMsg: Msg = {
          id: botId,
          role: "assistant",
          content: parsed.text || "Desculpe, não consegui responder. Pode reformular?",
          raw: full,
          options: parsed.options,
          handoff: parsed.handoff,
          lead: parsed.lead,
        };
        setMessages((prev) => (started ? prev.map((m) => (m.id === botId ? finalMsg : m)) : [...prev, finalMsg]));

        if (parsed.lead) {
          track("chat_lead_captured", { servico: parsed.lead.servico || "n/d" });
          saveLead(parsed.lead);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error(err);
        track("chat_error");
        setMessages((prev) => [
          ...prev,
          {
            id: botId,
            role: "assistant",
            error: true,
            handoff: true,
            content: "Estou com dificuldades técnicas neste momento. Pode falar diretamente com a nossa equipa pelo WhatsApp.",
          },
        ]);
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [loading, messages],
  );

  const reset = () => {
    abortRef.current?.abort();
    setMessages([greeting()]);
    setLoading(false);
  };

  const openChat = () => {
    setIsOpen(true);
    track("chat_open");
  };

  const directMessage = () => {
    const asked = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ")
      .slice(0, 400);
    return asked ? `Olá! Vim pelo site da TecKnowHow. ${asked}` : "Olá! Vim pelo site da TecKnowHow e gostaria de mais informações.";
  };

  const last = messages[messages.length - 1];
  const onlyWelcome = messages.length === 1;

  return (
    <div className="fixed z-50 font-sans">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed inset-0 z-50 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[390px] sm:h-[640px] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden bg-white sm:rounded-3xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)] sm:border sm:border-gray-200/70"
            role="dialog"
            aria-label="Assistente TecKnowHow"
          >
            {/* Header */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 px-4 pt-4 pb-6 text-white">
              <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-yellow-300/20 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <div className="relative">
                  <Avatar size="lg" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-tight">Tecka · TecKnowHow</p>
                  <p className="text-xs text-white/80">Assistente virtual · responde na hora</p>
                </div>
                <button onClick={reset} className="p-2 rounded-full hover:bg-white/15 transition" aria-label="Nova conversa" title="Nova conversa">
                  <RotateCcw size={17} />
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/15 transition" aria-label="Minimizar">
                  <ChevronDown size={20} />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div ref={scrollRef} className="-mt-3 flex-1 overflow-y-auto rounded-t-3xl bg-gray-50 px-4 pt-5 pb-3 space-y-3 overscroll-contain">
              <AnimatePresence initial={false}>
                {messages.map((m) =>
                  m.role === "user" ? (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-orange-500 to-orange-600 px-3.5 py-2 text-sm text-white shadow-sm shadow-orange-500/20 whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                      <div className="flex items-end gap-2">
                        <Avatar />
                        <div
                          className={`max-w-[82%] rounded-2xl rounded-bl-md px-3.5 py-2 text-sm leading-relaxed shadow-sm break-words ${
                            m.error ? "bg-red-50 text-red-700 border border-red-100" : "bg-white text-gray-700 border border-gray-100"
                          }`}
                        >
                          <RichText text={m.content} />
                        </div>
                      </div>

                      {m.lead && <LeadCard lead={m.lead} />}

                      {m.handoff && (
                        <motion.a
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          href={waLink(directMessage())}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => track("chat_whatsapp_click", { origem: "direto" })}
                          className="ml-9 inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebe5b] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-green-500/20 transition hover:-translate-y-0.5"
                        >
                          <MessageCircle size={14} /> Falar com a equipa no WhatsApp
                        </motion.a>
                      )}

                      {m.options && m === last && !loading && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-9 flex flex-wrap gap-2">
                          {m.options.map((o) => (
                            <button
                              key={o}
                              onClick={() => send(o)}
                              className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-600 transition hover:border-orange-400 hover:bg-orange-50"
                            >
                              {o}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ),
                )}
              </AnimatePresence>

              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
                  <Avatar />
                  <div className="rounded-2xl rounded-bl-md bg-white border border-gray-100 px-3 py-1.5 shadow-sm">
                    <TypingDots />
                  </div>
                </motion.div>
              )}

              {onlyWelcome && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="grid grid-cols-3 gap-2 pt-1"
                >
                  {SUGGESTIONS.map(({ label, message, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => send(message)}
                      className="group flex h-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-orange-100 bg-white px-2 py-3 text-center text-[11px] font-semibold leading-tight text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition group-hover:bg-orange-500 group-hover:text-white">
                        <Icon size={16} />
                      </span>
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-gray-100 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1.5 pl-3.5 transition focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  maxLength={1000}
                  placeholder="Escreva a sua mensagem..."
                  className="flex-1 resize-none bg-transparent py-1.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 max-h-28"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-500/30 transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100"
                  aria-label="Enviar"
                >
                  <ArrowUp size={18} />
                </button>
              </form>
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-gray-400">
                <span>
                  Assistente com IA ·{" "}
                  <a href="/politica-de-privacidade" className="underline hover:text-gray-600">
                    privacidade
                  </a>
                </span>
                <a
                  href={waLink(directMessage())}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("chat_whatsapp_click", { origem: "rodape" })}
                  className="inline-flex items-center gap-1 font-medium text-[#1ea952] hover:underline"
                >
                  <MessageCircle size={11} /> Falar com humano
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botão flutuante */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            key="launcher"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex items-center gap-3"
          >
            <AnimatePresence>
              {unread && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0, transition: { delay: 1.5 } }}
                  exit={{ opacity: 0, x: 10 }}
                  className="hidden sm:flex items-center gap-2 rounded-2xl rounded-br-sm bg-white pl-4 pr-2 py-2.5 text-sm text-gray-700 shadow-xl border border-gray-100"
                >
                  <button onClick={openChat}>Precisa de ajuda com a sua obra?</button>
                  <button onClick={() => setUnread(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Fechar">
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={openChat}
              className="group relative w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 p-1 shadow-[0_10px_30px_-6px_rgba(249,115,22,0.6)] transition hover:scale-110 active:scale-95"
              aria-label="Abrir assistente"
            >
              <span className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-20" />
              <span className="relative block w-full h-full rounded-full overflow-hidden ring-2 ring-white/70">
                <EngineerAvatar className="w-full h-full" />
              </span>
              <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-400 ring-2 ring-white" />
              {unread && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-white text-[10px] font-bold text-white flex items-center justify-center">
                  1
                </span>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WhatsAppChat;
