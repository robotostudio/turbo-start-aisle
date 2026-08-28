import type {
  QueryFooterDataResult,
  QueryGlobalSeoSettingsResult,
} from "@workspace/sanity/types";
import Link from "next/link";
import { Fragment } from "react";

import { NewsletterForm } from "./footer/newsletter-form";
// import { ModeToggle } from "./mode-toggle";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  RobotoWordmark,
  ShopifyIcon,
  VercelIcon,
  XIcon,
  YoutubeIcon,
} from "./social-icons";

type SocialLinksProps = {
  data: NonNullable<QueryGlobalSeoSettingsResult>["socialLinks"];
};

type FooterProps = {
  data: QueryFooterDataResult;
  settingsData: QueryGlobalSeoSettingsResult;
};

type ResolvedFooterProps = {
  data: NonNullable<QueryFooterDataResult>;
  settingsData: NonNullable<QueryGlobalSeoSettingsResult>;
};

/**
 * Takes its data as props rather than fetching.
 *
 * The root layout awaits every Sanity read up front (`lib/navigation.ts`), so a
 * fetch in here could not begin until that one resolved — a second serial round
 * trip ahead of the whole document, on every route, now that there is no
 * Suspense boundary to flush a shell first.
 */
export function Footer({ data, settingsData }: FooterProps) {
  // Null data means the documents are missing or unpublished. Nothing is the
  // honest answer: this is not a loading state, and a pulsing skeleton that
  // will never resolve reads as a broken page. A failed *read* is a different
  // thing and is left to propagate.
  if (!(data && settingsData)) {
    return null;
  }
  return <FooterContent data={data} settingsData={settingsData} />;
}

function SocialLinks({ data }: SocialLinksProps) {
  if (!data) {
    return null;
  }

  const { facebook, twitter, instagram, youtube, linkedin } = data;

  const socialLinks = [
    { url: twitter, Icon: XIcon, label: "Follow us on Twitter" },
    { url: facebook, Icon: FacebookIcon, label: "Follow us on Facebook" },
    { url: linkedin, Icon: LinkedinIcon, label: "Follow us on LinkedIn" },
    { url: instagram, Icon: InstagramIcon, label: "Follow us on Instagram" },
    { url: youtube, Icon: YoutubeIcon, label: "Subscribe to our YouTube" },
  ].filter((link) => link.url);

  return (
    <ul className="flex items-center gap-3 text-muted-foreground">
      {socialLinks.map(({ url, Icon, label }, index) => (
        <li key={`social-link-${url}-${index.toString()}`}>
          <Link
            aria-label={label}
            href={url ?? "#"}
            prefetch={false}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon className="size-[18px] fill-muted-foreground transition-colors hover:fill-foreground" />
            <span className="sr-only">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FooterColumns({
  columns,
}: Pick<ResolvedFooterProps["data"], "columns">) {
  if (!(Array.isArray(columns) && columns.length > 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-14">
      {columns.map((column, index) => (
        <div key={`column-${column?._key}-${index}`}>
          <h3 className="mb-2 text-muted-foreground text-sm">
            {column?.title}
          </h3>
          {column?.links && column.links.length > 0 && (
            <ul className="space-y-1">
              {column.links.map((link, columnIndex) => (
                // A link whose target is archived or deleted resolves to a null
                // href; `?? "#"` kept the row as a dead anchor.
                <Fragment
                  key={`${link._key}-${columnIndex}-column-${column?._key}`}
                >
                  {link?.href ? (
                    <li>
                      <Link
                        className="text-foreground text-sm hover:underline"
                        href={link.href}
                        rel={
                          link.openInNewTab ? "noopener noreferrer" : undefined
                        }
                        target={link.openInNewTab ? "_blank" : undefined}
                      >
                        {link.name}
                      </Link>
                    </li>
                  ) : null}
                </Fragment>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function HostingCredits() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-foreground text-sm">
      <a
        aria-label="Roboto Studio"
        href="https://robotostudio.com/"
        rel="noopener noreferrer"
        target="_blank"
        className="flex items-center gap-1 hover:opacity-80"
      >
        Built by
        <RobotoWordmark className="h-2.5 w-auto" />
      </a>
      <span className="h-4 w-px bg-border" />
      <a
        className="flex items-center gap-1 hover:opacity-80"
        href="https://vercel.com"
        rel="noopener noreferrer"
        target="_blank"
      >
        Hosted on
        <VercelIcon className="h-3.5 w-auto" />
      </a>
      <span className="h-4 w-px bg-border" />
      <a
        className="flex items-center gap-1 hover:opacity-80"
        href="https://shopify.com"
        rel="noopener noreferrer"
        target="_blank"
      >
        Powered by
        <ShopifyIcon className="h-4 w-auto" />
      </a>
    </div>
  );
}

function FooterContent({ data, settingsData }: ResolvedFooterProps) {
  const { columns } = data;
  const { siteTitle, socialLinks } = settingsData;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 bg-background">
      <div className="site-container">
        <div className="flex flex-col justify-between gap-10 py-9 lg:flex-row">
          <div className="flex flex-col gap-6">
            <NewsletterForm />
            {socialLinks && <SocialLinks data={socialLinks} />}
          </div>
          <FooterColumns columns={columns} />
        </div>
        <div className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
          <p className="text-foreground text-sm">
            © {year} {siteTitle}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <HostingCredits />
            {/* <ModeToggle /> */}
          </div>
        </div>
      </div>
    </footer>
  );
}
