import type { InsightsDataset, ResultKey } from "./dataset";

/** Every wording that changes with the result being measured. */
export interface ResultCopy {
  key: ResultKey;
  /** Selector label. */
  option: string;
  one: string;
  many: string;
  costShort: string;
  costLabel: string;
  crShort: string;
  /** "El cost per lead", subject of the narrative sentences. */
  costSubject: string;
  /** "el lead més barat" */
  cheapest: string;
  /** "de clic a lead" */
  clickToResult: string;
  /** "els clics en leads" */
  clicksIntoResults: string;
  /** The plural with its article: "els leads", "les compres". */
  theMany: string;
  /** The same, contracted after "de": "dels leads", "de les compres". */
  ofTheMany: string;
  /** What comes after the click, with article, bare and contracted. */
  landing: string;
  landingBare: string;
  atLanding: string;
  /** False when the result does not come after a click, so CR says nothing about a landing page. */
  followsClick: boolean;
}

const FORM = { landing: "el formulari", landingBare: "formulari", atLanding: "al formulari", followsClick: true };
const PAGE = { landing: "la pàgina", landingBare: "pàgina", atLanding: "a la pàgina", followsClick: true };

export const RESULT_TYPES: Record<ResultKey, ResultCopy> = {
  lead: { key: "lead", option: "Leads", one: "lead", many: "leads", costShort: "CPL", costLabel: "Cost per lead", crShort: "CR Leads", costSubject: "El cost per lead", cheapest: "el lead més barat", clickToResult: "de clic a lead", clicksIntoResults: "els clics en leads", theMany: "els leads", ofTheMany: "dels leads", ...FORM },
  purchase: { key: "purchase", option: "Compres", one: "compra", many: "compres", costShort: "CPA", costLabel: "Cost per compra", crShort: "CR Compres", costSubject: "El cost per compra", cheapest: "la compra més barata", clickToResult: "de clic a compra", clicksIntoResults: "els clics en compres", theMany: "les compres", ofTheMany: "de les compres", landing: "la pàgina de compra", landingBare: "pàgina de compra", atLanding: "a la pàgina de compra", followsClick: true },
  complete_registration: { key: "complete_registration", option: "Registres", one: "registre", many: "registres", costShort: "Cost/reg.", costLabel: "Cost per registre", crShort: "CR Registres", costSubject: "El cost per registre", cheapest: "el registre més barat", clickToResult: "de clic a registre", clicksIntoResults: "els clics en registres", theMany: "els registres", ofTheMany: "dels registres", ...FORM },
  landing_page_view: { key: "landing_page_view", option: "Visites a la pàgina", one: "visita", many: "visites", costShort: "Cost/visita", costLabel: "Cost per visita", crShort: "CR Visites", costSubject: "El cost per visita", cheapest: "la visita més barata", clickToResult: "de clic a visita", clicksIntoResults: "els clics en visites", theMany: "les visites", ofTheMany: "de les visites", ...PAGE },
  link_click: { key: "link_click", option: "Clics a l’enllaç", one: "clic", many: "clics", costShort: "CPC", costLabel: "Cost per clic", crShort: "CR Clics", costSubject: "El cost per clic", cheapest: "el clic més barat", clickToResult: "de clic a clic", clicksIntoResults: "els clics en clics", theMany: "els clics", ofTheMany: "dels clics", ...PAGE },
  post_engagement: { key: "post_engagement", option: "Interaccions", one: "interacció", many: "interaccions", costShort: "Cost/int.", costLabel: "Cost per interacció", crShort: "Int./clic", costSubject: "El cost per interacció", cheapest: "la interacció més barata", clickToResult: "de clic a interacció", clicksIntoResults: "els clics en interaccions", theMany: "les interaccions", ofTheMany: "de les interaccions", ...PAGE, followsClick: false },
  thruplay: { key: "thruplay", option: "ThruPlays", one: "ThruPlay", many: "ThruPlays", costShort: "Cost/ThruPlay", costLabel: "Cost per ThruPlay", crShort: "ThruPlays/clic", costSubject: "El cost per ThruPlay", cheapest: "el ThruPlay més barat", clickToResult: "de clic a ThruPlay", clicksIntoResults: "els clics en ThruPlays", theMany: "els ThruPlays", ofTheMany: "dels ThruPlays", ...PAGE, followsClick: false },
};

const RESULT_BY_OBJECTIVE: Record<string, ResultKey> = {
  OUTCOME_LEADS: "lead",
  LEAD_GENERATION: "lead",
  OUTCOME_SALES: "purchase",
  CONVERSIONS: "purchase",
  OUTCOME_ENGAGEMENT: "post_engagement",
  POST_ENGAGEMENT: "post_engagement",
  OUTCOME_TRAFFIC: "landing_page_view",
  LINK_CLICKS: "landing_page_view",
  OUTCOME_AWARENESS: "thruplay",
  VIDEO_VIEWS: "thruplay",
};

/** Result types that actually occur in the dataset, in selector order. */
export function availableResults(dataset: InsightsDataset): ResultKey[] {
  const seen = new Set<ResultKey>();
  for (const row of dataset.rows) {
    for (const key of Object.keys(row.results) as ResultKey[]) if (row.results[key]) seen.add(key);
  }
  return (Object.keys(RESULT_TYPES) as ResultKey[]).filter((key) => seen.has(key));
}

/** The result of the objective that takes most of the spend, if it occurs at all. */
export function defaultResult(dataset: InsightsDataset): ResultKey {
  const objectiveOf = new Map(dataset.campaigns.map((c) => [c.id, c.objective]));
  const spendByResult = new Map<ResultKey, number>();
  for (const row of dataset.rows) {
    const key = RESULT_BY_OBJECTIVE[objectiveOf.get(row.campaignId) ?? ""];
    if (key) spendByResult.set(key, (spendByResult.get(key) ?? 0) + row.spend);
  }
  const available = availableResults(dataset);
  const ranked = [...spendByResult.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  return ranked.find((key) => available.includes(key)) ?? available[0] ?? "link_click";
}
