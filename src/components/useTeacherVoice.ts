"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripPageRefs } from "@/lib/blocks";

/** Splits text into short utterances (long ones get cut off by some browsers). */
export function splitIntoChunks(text: string, max = 180): string[] {
  const parts = text
    .split(/(?<=[.!؟?،:\n])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= max) {
      const last = out[out.length - 1];
      if (last && last.length + p.length + 1 <= max && !/[.!؟?\n]$/.test(last)) out[out.length - 1] = `${last} ${p}`;
      else out.push(p);
      continue;
    }
    let rest = p;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max / 2) cut = max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

function pickArabicVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ar = voices.filter((v) => v.lang?.toLowerCase().startsWith("ar"));
  if (!ar.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const n = `${v.name} ${v.voiceURI}`.toLowerCase();
    let s = 0;
    if (v.lang.toLowerCase() === "ar-iq") s += 6;
    else if (/ar-(sa|ae|kw|jo|eg)/i.test(v.lang)) s += 2;
    if (/natural|neural|online|premium|enhanced/.test(n)) s += 5;
    if (/google|microsoft/.test(n)) s += 3;
    if (v.localService === false) s += 1;
    return s;
  };
  return [...ar].sort((a, b) => score(b) - score(a))[0];
}

export type VoiceState = "idle" | "speaking" | "paused";

/**
 * Teacher voice on top of the browser's speech engine.
 * speakSequence() reads items one after another and reports which one is being read.
 */
export function useTeacherVoice() {
  const [supported, setSupported] = useState(false);
  const [hasArabic, setHasArabic] = useState(true);
  const [state, setState] = useState<VoiceState>("idle");
  const [current, setCurrent] = useState<number | null>(null);
  const [slow, setSlow] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => {
      const v = pickArabicVoice(window.speechSynthesis.getVoices());
      voiceRef.current = v;
      if (window.speechSynthesis.getVoices().length) setHasArabic(!!v);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    runRef.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
    setCurrent(null);
  }, []);

  const speakSequence = useCallback(
    (items: string[], startAt = 0) => {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const run = ++runRef.current;
      const queue: { item: number; text: string }[] = [];
      items.forEach((t, i) => {
        if (i < startAt) return;
        for (const c of splitIntoChunks(stripPageRefs(t))) queue.push({ item: i, text: c });
      });
      if (!queue.length) return;
      setState("speaking");
      let k = 0;
      const next = () => {
        if (run !== runRef.current) return;
        if (k >= queue.length) {
          setState("idle");
          setCurrent(null);
          return;
        }
        const { item, text } = queue[k++];
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voiceRef.current?.lang ?? "ar-SA";
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = slow ? 0.82 : 1;
        u.pitch = 1.05;
        u.onstart = () => run === runRef.current && setCurrent(item);
        u.onend = next;
        u.onerror = (e) => {
          if (e.error === "interrupted" || e.error === "canceled") return;
          next();
        };
        synth.speak(u);
      };
      next();
    },
    [slow],
  );

  const speak = useCallback((text: string) => speakSequence([text]), [speakSequence]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState("paused");
  }, []);
  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState("speaking");
  }, []);

  return { supported, hasArabic, state, current, slow, setSlow, speak, speakSequence, pause, resume, stop };
}
