import type { JupiterQuote } from "../../../src/services/backend/contracts";
export class Jupiter {
  constructor(options?: { key?: string; fetchImpl?: typeof fetch });
  quote(
    inputMint: string,
    outputMint: string,
    amount: string,
  ): Promise<JupiterQuote>;
}
