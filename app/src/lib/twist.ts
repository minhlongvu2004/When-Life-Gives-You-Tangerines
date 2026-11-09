// Turns a judge's twist card ("This customer was laid off. EI pays 55%…") into engine sliders.
// Deterministic and offline on purpose: the live demo must never depend on a network call.
import { NO_SHOCK, type Shock } from "./engine";

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, half: 0.5, "half a": 0.5, full: 1, single: 1, double: 2, twice: 2,
};
const num = (s: string) => (s in WORDS ? WORDS[s] : Number(s.replace(/,/g, "")));
const NUM = String.raw`(\d+(?:[.,]\d+)*|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|half(?: a)?|full|single|double|twice)`;

export interface ParsedTwist {
  shock: Shock;
  understood: string[];
}

export function parseTwist(text: string): ParsedTwist {
  const t = (" " + text.toLowerCase() + " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s*(?:per ?cent|pct)\b/g, "%")
    .replace(/\s+/g, " ");
  const s: Shock = { ...NO_SHOCK };
  const understood: string[] = [];
  let m: RegExpMatchArray | null;

  // --- income ---
  const jobLoss = /(laid off|lay-?off|lose[s]? (?:their |his |her |my |a |the )?job|job loss|lost (?:their |his |her |a )?job|unemploy|fired|let go|redundan)/.test(t);
  if (jobLoss) {
    s.jobLoss = true;
    s.incomePct = 0.55;
    if ((m = t.match(/ei[^.%]*?(\d+(?:\.\d+)?)\s*%/)) || (m = t.match(/(\d+(?:\.\d+)?)\s*%\s*of (?:their |his |her )?(?:usual |normal |typical )?(?:income|pay|salary|earnings)/)))
      s.incomePct = Number(m[1]) / 100;
    understood.push(`Job loss: income ${Math.round(s.incomePct * 100)}% of usual (EI estimate)`);
    if ((m = t.match(new RegExp(String.raw`(?:for|lasts?|over)\s+${NUM}\s+months?`))) || (m = t.match(new RegExp(String.raw`${NUM}[- ]months? (?:of )?(?:ei|benefits)`)))) {
      s.durationMonths = num(m[1]);
      understood.push(`Lasts ${s.durationMonths} months`);
    }
  } else if ((m = t.match(/(?:income|pay|salary|hours|earnings)[^.%]*?(?:cut|drop|fall|reduced|down|lower)[^.%]*?(\d+(?:\.\d+)?)\s*%/)) || (m = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:pay|income|salary) cut/))) {
    s.incomePct = 1 - Number(m[1]) / 100;
    understood.push(`Income down ${m[1]}% (${Math.round(s.incomePct * 100)}% still coming in)`);
  }

  // --- bills / rent increases ---
  if ((m = t.match(/(?:household bills|bills|rent|utilit(?:y|ies)|hydro|heating|mortgage)[^.%$]*?(?:up|rise|rises|increase|increases|go up|goes up|higher|jump|jumps|climb)[^.%$]*?(?:by )?(\d+(?:\.\d+)?)\s*%/)) ||
      (m = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:increase|rise|jump|more)[^.]*?(?:bills|rent|utilit)/))) {
    s.billsPct = Number(m[1]) / 100;
    understood.push(`Rent/bills +${m[1]}%`);
  }
  if ((m = t.match(/(?:rent|bills|mortgage|childcare|daycare|costs?)[^.$]*?(?:up|rise|rises|increase|increases|go up|goes up|jump|jumps|extra|more)[^.$]*?\$\s?(\d[\d,]*(?:\.\d+)?)/)) ||
      (m = t.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:a|per|\/)\s*month/))) {
    s.extraMonthly = num(m[1]);
    understood.push(`Other monthly cost +$${s.extraMonthly.toLocaleString()}`);
  }

  // --- one-off costs ---
  const oneOffWord = /(repair|furnace|roof|car|vehicle|transmission|emergency|surprise|unexpected|vet|dental|medical|hospital|funeral|flood|fire|one[- ]off|one[- ]time|bill of|costs?)/;
  if (oneOffWord.test(t)) {
    if ((m = t.match(new RegExp(String.raw`${NUM}\s+(?:full\s+)?months?(?:'s|')?\s+(?:worth\s+)?(?:of\s+)?(?:their\s+|his\s+|her\s+)?(?:typical\s+|usual\s+|normal\s+|average\s+)?(?:spending|expenses|costs|money out|outgoings)`)))) {
      s.oneOffMult = num(m[1]);
      understood.push(`One-time cost: ${s.oneOffMult === 1 ? "1 month" : `${s.oneOffMult} months`} of spending`);
    } else if ((m = t.match(/(?:repair|furnace|roof|car|bill|costs?|pay|vet|dental|medical|emergency)[^.]*?\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?/)) && !/(?:a|per|\/)\s*month/.test(t.slice(t.indexOf(m[0]) + m[0].length, t.indexOf(m[0]) + m[0].length + 12))) {
      s.oneOffAbs = num(m[1]) * (m[2] ? 1000 : 1);
      understood.push(`One-time cost: $${s.oneOffAbs.toLocaleString()}`);
    }
  }
  return { shock: s, understood };
}
