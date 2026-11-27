import type { AdAccount } from "@/tracking/domain/dataset";
import type { FetchOptions } from "./fetch-options";

export interface AdAccountRepository {
  listAll(options?: FetchOptions): Promise<AdAccount[]>;
}
