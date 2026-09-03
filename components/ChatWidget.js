"use client";

import { useEffect, useRef, useState } from "react";
import { matchFaq } from "../lib/chatFaq";
import "./chatWidget.css";

const QUICK_TOPICS = ["Pricing", "Transit time", "Insurance", "How it works"];
const GREETING = "Hi! I'm the Scherz Trucking assistant. Ask me about pricing, transit times, insurance, or how shipping works — or I can connect you with a coordinator.";
const MISS_MSG = "I don't have a good answer for that one. Try rephrasing, or ask me below and I'll get a coordinator to help.";

// Floating chat bubble (bottom-right, every page). Rule-based FAQ matching —
// no LLM call, no per-message cost (lib/chatFaq.js). When it can't help
// (or the visitor asks for a human), it collects contact info and creates
// a real lead via the same /api/leads endpoint the quote forms use, so it
// routes to the right tenant and shows up in the CRM like any other lead.
export default function ChatWidget({ serviceSlug = "car-shipping", sourcePageId = null, tenantId = null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "bot", text: GREETING }]);
  const [input, setInput] = useState("");
  const [misses, setMisses] = useState(0);
  const [mode, setMode] = useState("chat"); // 'chat' | 'capture' | 'done'
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, mode]);

  function pushBot(text) {
    setMessages((m) => [...m, { role: "bot", text }]);
  }
  function pushUser(text) {
    setMessages((m) => [...m, { role: "user", text }]);
  }

  function handleSend(text) {
    const q = (text ?? input).trim();
    if (!q) return;
    pushUser(q);
    setInput("");
    const lower = q.toLowerCase();
    const wantsHuman = ["human", "agent", "representative", "real person", "talk to someone", "speak to someone"].some((t) => lower.includes(t));
    if (wantsHuman) {
      startCapture();
      return;
    }
    const answer = matchFaq(q);
    if (answer) {
      pushBot(answer);
      setMisses(0);
    } else {
      const next = misses + 1;
      setMisses(next);
      if (next >= 2) startCapture();
      else pushBot(MISS_MSG);
    }
  }

  function startCapture() {
    setMode("capture");
    pushBot("Let's get you connected with a coordinator — what's your name and best phone number?");
  }

  async function submitCapture(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setSubmitError("Name and phone are required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const transcript = messages.map((m) => `${m.role === "user" ? "Visitor" : "Bot"}: ${m.text}`).join("\n").slice(0, 1800);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          service_slug: serviceSlug,
          source_page_id: sourcePageId,
          tenant_id: tenantId,
          lead_source: "chatbot",
          notes: transcript,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === "invalid_email" ? "That email looks invalid." : data.error || "Something went wrong.");
      setMode("done");
      pushBot(`Thanks, ${form.name.trim().split(" ")[0]}! Someone will reach out shortly at ${form.phone.trim()}.`);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cw-root">
      {open && (
        <div className="cw-panel">
          <div className="cw-head">
            <span>Scherz Trucking Assistant</span>
            <button type="button" className="cw-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="cw-body" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`cw-msg cw-msg-${m.role}`}>{m.text}</div>
            ))}
            {mode === "chat" && messages.length <= 1 && (
              <div className="cw-quick">
                {QUICK_TOPICS.map((t) => (
                  <button key={t} type="button" className="cw-quick-chip" onClick={() => handleSend(t)}>{t}</button>
                ))}
              </div>
            )}
            {mode === "capture" && (
              <form className="cw-capture" onSubmit={submitCapture}>
                <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input placeholder="Phone number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                {submitError && <div className="cw-error">{submitError}</div>}
                <button type="submit" className="cw-submit" disabled={submitting}>{submitting ? "Sending…" : "Send my info"}</button>
              </form>
            )}
          </div>
          {mode === "chat" && (
            <form
              className="cw-inputrow"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <input placeholder="Type your question…" value={input} onChange={(e) => setInput(e.target.value)} />
              <button type="submit" aria-label="Send">➤</button>
            </form>
          )}
        </div>
      )}
      <button type="button" className="cw-bubble" onClick={() => setOpen((v) => !v)} aria-label="Chat with us">
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
