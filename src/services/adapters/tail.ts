/** Frontend-only facade. Server endpoints, wallet signing and response formats stay intact. */
export {
  fetchAxiomFeed as getMarkets,
  fetchPulseLaunches as getNewPairs,
  searchAxioms as searchTokens,
  fetchAxiomLive as getToken,
} from "../../lib/axiom";
export {
  fetchStats as getNetwork,
  fetchBlocks as getBlocks,
  fetchTrades as getTrades,
  fetchHolders as getHolders,
} from "../../lib/api";
export {
  connectWallet,
  disconnectWallet,
  useWallet,
  refreshAccount,
} from "../../lib/wallet";
export {
  quoteSol as getBuyQuote,
  executeSwap as confirmBuy,
} from "../../lib/swap";
export {
  askAstra as askFable,
  astraStatus as getFableStatus,
} from "../../features/astra/client";
// Transaction confirmation is awaited by executeSwap; never infer success from submission.
