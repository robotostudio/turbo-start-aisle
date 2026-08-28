import { sanityFetch } from "@workspace/sanity/live";
import {
  queryFooterData,
  queryGlobalSeoSettings,
  queryNavbarData,
  queryPromoBannerData,
} from "@workspace/sanity/query";

/**
 * Every Sanity read the root layout needs, in a single round trip.
 *
 * The footer's reads live here rather than inside `FooterServer` because the
 * layout awaits this before it constructs its JSX: a fetch inside the footer
 * could not start until this one resolved, which put two serial round trips
 * ahead of the head, the fonts, the CSS and the navbar on every route. It also
 * means `queryGlobalSeoSettings` is read once and shared, rather than fetched
 * by the navbar and the footer separately.
 *
 * Deliberately unguarded. A rejected read propagates, which is the same call
 * `collections/page.tsx` made and wrote down: a degraded 200 is indistinguishable
 * from a legitimately empty store, production caches at `revalidate: false` so a
 * bad render sticks, and Next keeps serving the last good page when a background
 * re-render throws. `app/global-error.tsx` is where that landing is made decent.
 */
export const getLayoutData = async () => {
  const [navbarData, settingsData, promoBannerData, footerData] =
    await Promise.all([
      sanityFetch({ query: queryNavbarData }),
      sanityFetch({ query: queryGlobalSeoSettings }),
      sanityFetch({ query: queryPromoBannerData }),
      sanityFetch({ query: queryFooterData }),
    ]);

  return {
    navbarData: navbarData.data,
    settingsData: settingsData.data,
    promoBannerData: promoBannerData.data,
    footerData: footerData.data,
  };
};
