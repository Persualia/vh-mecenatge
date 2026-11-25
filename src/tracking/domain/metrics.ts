import type { CampaignKind } from "./campaigns";

/**
 * The short explanations shown beside the figures. Each one says what goes in the numerator
 * and the denominator, so a figure can be checked by hand. A view only shows the ones its
 * own campaign uses.
 */
export interface MetricNote {
  id: "cpl" | "roas" | "roi";
  short: string;
  name: string;
  formula: string;
  text: string;
}

export const METRIC_NOTES: Record<MetricNote["id"], MetricNote> = {
  cpl: {
    id: "cpl",
    short: "CPL",
    name: "Cost per lead",
    formula: "inversió total ÷ leads totals",
    text: "Quant costa cada contacte aconseguit. Se suma la inversió i els leads de totes les campanyes del grup i es divideix una suma per l’altra; no és la mitjana dels CPL de cada campanya. Si en un període no hi ha leads, no es pot calcular.",
  },
  roas: {
    id: "roas",
    short: "ROAS",
    name: "Retorn de la inversió publicitària",
    formula: "retorn ÷ despesa publicitària",
    text:
      "Quants euros de retorn genera cada euro d’anuncis. El ROAS actual fa servir el que s’ha facturat fins avui. " +
      "El ROAS del primer any suma, de cada registre, tots els anys que ha estat en marxa fins a l’any en curs: " +
      "un soci donat d’alta el 2026, mirat el 2028, hi aporta el 2026, el 2027 i el 2028, i un soci nou del 2028 hi " +
      "aporta el seu primer any. Mentre tots els registres són d’enguany, la xifra coincideix amb la projecció a un " +
      "any del fitxer. Les quotes marcades com a impagades a la taula de donants es resten de l’any que els toca.",
  },
  roi: {
    id: "roi",
    short: "ROI",
    name: "Retorn de la inversió",
    formula: "ingressos atribuïbles ÷ cost total de la campanya",
    text: "Com el ROAS, però el denominador inclou tot el cost de la campanya, no només els anuncis: honoraris, producció i plataformes. Sense aquestes partides no es pot calcular.",
  },
};

/** Shown where a ROI would go while the cost lines are still missing. */
export const ROI_PENDING = {
  label: "ROI pendent de costos totals",
  formula: METRIC_NOTES.roi.formula,
  text: "Hi ha la despesa d’anuncis de Meta i Google, però no els honoraris ni els costos de producció i plataformes. Mentre falten aquestes partides, es mostra la fórmula i no una xifra.",
} as const;

/** Only the metrics a campaign of this kind actually uses. */
export const notesFor = (kind: CampaignKind): MetricNote[] => (kind === "leads" ? [METRIC_NOTES.cpl] : [METRIC_NOTES.roas]);

/** A donations campaign reports money, so it is the one that owes a ROI. */
export const showsRoiPending = (kind: CampaignKind) => kind === "donatius";
