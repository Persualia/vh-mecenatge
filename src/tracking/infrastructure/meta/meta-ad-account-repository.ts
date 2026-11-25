import "server-only";
import type { AdAccountRepository } from "@/tracking/application/ports/ad-account-repository";
import type { AdAccount } from "@/tracking/domain/dataset";
import type { GraphClient } from "./graph-client";

interface GraphAccount {
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  business?: { id: string; name: string };
}

const ACCOUNT_STATUS: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
};

const FIELDS = "account_id,name,currency,account_status,business{id,name}";

/**
 * A system user only lists the accounts assigned to it on `/me/adaccounts`. Those
 * shared with the agency's Business Manager live on the business edges.
 */
export class MetaAdAccountRepository implements AdAccountRepository {
  constructor(
    private readonly graph: GraphClient,
    private readonly businessId: string,
  ) {}

  async listAll(): Promise<AdAccount[]> {
    const edges = ["me/adaccounts", `${this.businessId}/client_ad_accounts`, `${this.businessId}/owned_ad_accounts`];
    const lists = await Promise.all(edges.map((edge) => this.graph.getAll<GraphAccount>(edge, { fields: FIELDS, limit: "200" })));
    const accounts = new Map(lists.flat().map((a) => [a.account_id, a]));
    return [...accounts.values()].map((a) => ({
      id: a.account_id,
      name: a.name,
      currency: a.currency,
      status: ACCOUNT_STATUS[a.account_status] ?? String(a.account_status),
      businessId: a.business?.id ?? null,
      businessName: a.business?.name ?? null,
    }));
  }
}
