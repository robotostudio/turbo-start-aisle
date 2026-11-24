import { CopyShopPrompt } from "@/components/copy-shop-prompt";
import { shopPrompt } from "@/lib/agent-shop";
import { getSiteConfig } from "@/lib/seo";
import { getBaseUrl } from "@/utils";

/**
 * The sentence a shopper pastes into ChatGPT or Claude, with a copy button.
 * `getSiteConfig` reads the title without stega, and its Settings read is the
 * one every page's metadata already made, so this adds no round trip.
 */
export async function ShopPrompt() {
  const base = getBaseUrl();
  const { title } = await getSiteConfig(base);
  return <CopyShopPrompt prompt={shopPrompt(title, base)} />;
}
