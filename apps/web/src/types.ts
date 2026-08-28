import type {
  QueryBlogIndexPageBlogsResult,
  QueryBlogSlugPageDataResult,
  QueryGlobalSeoSettingsResult,
  QueryHomePageDataResult,
  QueryImageTypeResult,
  QueryNavbarDataResult,
} from "@workspace/sanity/types";

export type PageBuilderBlock = NonNullable<
  NonNullable<QueryHomePageDataResult>["pageBuilder"]
>[number];

export type PageBuilderBlockTypes = PageBuilderBlock["_type"];

export type PagebuilderType<T extends PageBuilderBlockTypes> = Extract<
  PageBuilderBlock,
  { _type: T }
>;

export type SanityButtonProps = NonNullable<
  NonNullable<PagebuilderType<"cta">>["buttons"]
>[number];

export type SanityImageProps = NonNullable<QueryImageTypeResult>;

export type SanityRichTextProps =
  NonNullable<QueryBlogSlugPageDataResult>["richText"];

export type SanityRichTextBlock = Extract<
  NonNullable<NonNullable<SanityRichTextProps>[number]>,
  { _type: "block" }
>;

export type Blog = NonNullable<QueryBlogIndexPageBlogsResult>[number];

export type Maybe<T> = T | null | undefined;

// Navigation types
export type NavigationData = {
  navbarData: QueryNavbarDataResult;
  settingsData: QueryGlobalSeoSettingsResult;
};

export type NavColumn = NonNullable<
  NonNullable<QueryNavbarDataResult>["columns"]
>[number];

export type ColumnLink =
  Extract<NavColumn, { type: "column" }>["links"] extends Array<infer T>
    ? T
    : never;

export type MenuLinkProps = {
  name: string;
  href: string;
  description?: string;
  icon?: string | null;
  onClick?: () => void;
};
