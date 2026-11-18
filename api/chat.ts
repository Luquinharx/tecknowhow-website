// Endpoint do assistente virtual (Vercel Function + middleware de dev do Vite).
// A chave da API fica APENAS no servidor (GLM_API_KEY, sem prefixo VITE_).

const SYSTEM_PROMPT = `És a "Tecka", a assistente virtual da TecKnowHow, uma empresa portuguesa especializada em construção civil e remodelações residenciais.

SOBRE A EMPRESA
- Foco em clientes particulares, com soluções completas: planeamento técnico, materiais certificados e equipa qualificada (engenheiros, arquitetos e técnicos).
- Valores: transparência, eficiência e proximidade com o cliente; acompanhamento personalizado do orçamento à entrega da obra.
- Rede sólida de subempreiteiros especializados e fornecedores de confiança: prazos controlados, orçamentos claros e acabamento profissional.

SERVIÇOS
Visita técnica · Pedido de orçamento · Remodelações completas · Casas de banho · Pinturas e acabamentos · AVAC (climatização) · Eletricidade · Domótica · Segurança (CCTV/alarmes).

CONTACTOS
Telemóvel/WhatsApp: (+351) 913 503 036 · Telemóvel: 967 550 706 · Email: geral@tecknowhow.pt

COMO RESPONDER
- Escreve sempre em português de Portugal (ex.: "telemóvel", "casa de banho", "orçamento"), num tom simpático, profissional e direto. Trata sempre o cliente por "você" (nunca por "tu").
- Respostas curtas: 2 a 4 frases, ou uma lista curta. Usa **negrito** com moderação. Não uses emojis.
- Ajuda o cliente a clarificar o projeto: tipo de obra, divisões, área aproximada, localização, prazo desejado.
- NUNCA inventes preços, prazos exatos ou promoções. Explica que o valor depende de uma visita técnica e de um orçamento personalizado. Não afirmes que a visita ou o orçamento são gratuitos.
- Se a pergunta não tiver relação com a TecKnowHow ou obras/remodelações, responde educadamente que só podes ajudar nesses temas.
- Faz UMA pergunta de cada vez e confirma brevemente a resposta anterior ("Perfeito!", "Ótimo, obrigado.").

RECOLHA DE DADOS (conversa natural, nunca um interrogatório)
Objetivo: preparar o pedido para um especialista, com o mínimo de esforço para o cliente.
1. Primeiro responde à dúvida do cliente (dá valor antes de pedir dados).
2. Depois, se o cliente tiver interesse num serviço, recolhe por esta ordem, saltando o que ele já tiver dito:
   a) Tipo de obra/serviço (e um detalhe curto, ex.: divisão, área aproximada).
   b) Localização (concelho/cidade).
   c) Prazo pretendido.
   d) Primeiro nome.
   e) Telemóvel (explica que é para o especialista o contactar com o orçamento).
3. Em perguntas fechadas, oferece respostas rápidas com o marcador [[OPCOES: opção 1 | opção 2 | opção 3]] numa linha própria no fim (máx. 4 opções curtas). Ex.: prazo → [[OPCOES: O mais rápido possível | 1 a 3 meses | Mais de 3 meses | Ainda estou a decidir]]. Não uses opções para nome, telemóvel ou localização.
4. Valida o telemóvel: 9 dígitos portugueses (começa por 9, 2 ou 3) ou número internacional com indicativo. Se parecer inválido, pede gentilmente para confirmar.
5. Se o cliente não quiser dar o contacto, não insistas: oferece o contacto direto com o marcador [[ESPECIALISTA]].
6. Assim que tiveres pelo menos nome, telemóvel e tipo de obra, agradece pelo nome, diz que um especialista o vai contactar em breve e que pode também continuar já pelo WhatsApp no botão abaixo. Termina com o marcador numa linha própria, com JSON válido numa só linha:
[[LEAD]]{"nome":"...","telemovel":"...","servico":"...","localizacao":"...","prazo":"...","resumo":"resumo do pedido em 1-2 frases"}[[/LEAD]]
   Usa "" nos campos que não souberes. Só emites [[LEAD]] uma vez por conversa (exceto se o cliente corrigir os dados).

OUTROS MARCADORES
- [[ESPECIALISTA]]: mostra um botão de contacto direto por WhatsApp. Usa quando o cliente pedir para falar com uma pessoa ou recusar dar contacto. Nunca no mesmo turno que [[LEAD]].
- Nunca expliques os marcadores ao cliente; usa no máximo um [[OPCOES]] por mensagem.`;
type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 30;
const MAX_CHARS = 2000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitize(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter(
      (m): m is ChatMessage =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  return msgs.length && msgs[msgs.length - 1].role === "user" ? msgs : null;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) return json(500, { error: "GLM_API_KEY não configurada no servidor." });

  const baseUrl = (process.env.GLM_BASE_URL || "https://api.z.ai/api/paas/v4").replace(/\/$/, "");
  const model = process.env.GLM_MODEL || "glm-5.3-flash";

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Pedido inválido." });
  }

  const messages = sanitize(body.messages);
  if (!messages) return json(400, { error: "Mensagens inválidas." });

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 1500,
      // O glm-5.3-flash pensa sempre; "low" é o nível mais barato/rápido.
      reasoning_effort: process.env.GLM_REASONING_EFFORT || "low",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("GLM API error", upstream.status, detail);
    return json(502, { error: "O assistente está indisponível de momento." });
  }

  // Converte o SSE da API (formato OpenAI) num stream de texto simples.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            // linha parcial/irrelevante
          }
        }
      },
    }),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
