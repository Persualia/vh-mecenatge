import type { AdAccount } from "@/tracking/domain/dataset";

export interface AdAccountRepository {
  listAll(): Promise<AdAccount[]>;
}
