import type { Page } from 'playwright';
import type { PlatformName } from '../config/constants';
import type { AccountSnapshot, OrgSeed, PostLink } from '../config/schema';
import type { ExtractedPost } from './shared';
import { collectInstagramAccountSnapshot } from './instagram.accounts';
import { enumerateInstagramPostLinks, extractInstagramPost } from './instagram.posts';
import { collectFacebookAccountSnapshot } from './facebook.accounts';
import { enumerateFacebookPostLinks, extractFacebookPost } from './facebook.posts';
import { collectLinkedInAccountSnapshot } from './linkedin.accounts';
import { enumerateLinkedInPostLinks, extractLinkedInPost } from './linkedin.posts';

export const accountCollectors: Record<
  PlatformName,
  (page: Page, org: OrgSeed, runId: string) => Promise<AccountSnapshot>
> = {
  instagram: collectInstagramAccountSnapshot,
  facebook: collectFacebookAccountSnapshot,
  linkedin: collectLinkedInAccountSnapshot,
};

export const postEnumerators: Record<
  PlatformName,
  (page: Page, org: OrgSeed, maxUrls: number) => Promise<PostLink[]>
> = {
  instagram: enumerateInstagramPostLinks,
  facebook: enumerateFacebookPostLinks,
  linkedin: enumerateLinkedInPostLinks,
};

export const postExtractors: Record<PlatformName, (page: Page) => Promise<ExtractedPost>> = {
  instagram: extractInstagramPost,
  facebook: extractFacebookPost,
  linkedin: extractLinkedInPost,
};
