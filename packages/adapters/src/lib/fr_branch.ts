// Which branch of government an FR document comes from (event.branch), decided from the FR's own agency slugs.
//
// The FR API has no "branch" field, so this is a fixed, citable table, never a judgment per document:
// - presidential documents are executive (the President signs them);
// - legislative-branch and judicial-branch agencies also publish in the FR, so they get their own branch;
// - "independent" means exactly the statutory list of independent regulatory agencies in 44 U.S.C. 3502(5)
//   (text checked 2026-10-02 at law.cornell.edu/uscode/text/44/3502). Agencies outside that list that are often called
//   "independent" (FEC, USPS, EEOC, ...) stay "executive": the statute is the only neutral list there is;
// - everything else, and a document with no agency at all (the Office of the Federal Register, part of NARA, is an
//   executive agency), is executive.
// Every slug below was checked against the live FR agency registry (api/v1/agencies.json, 473 agencies, 2026-10-02).
// FR lists a parent department before its sub-agency (e.g. Energy Department, then FERC; Treasury, then the OCC),
// so every listed agency is checked, not just the first.
import type { Branch } from '@ced/schema'

/** 44 U.S.C. 3502(5), in the statute's order, as FR slugs. */
export const INDEPENDENT_REGULATORY_SLUGS: ReadonlySet<string> = new Set([
  'federal-reserve-system', // Board of Governors of the Federal Reserve System
  'commodity-futures-trading-commission',
  'consumer-product-safety-commission',
  'federal-communications-commission',
  'federal-deposit-insurance-corporation',
  'federal-energy-regulatory-commission', // FR parent: Energy Department
  'federal-housing-finance-agency',
  'federal-maritime-commission',
  'federal-trade-commission',
  'interstate-commerce-commission', // abolished 1995; still in the statute and the registry
  'federal-mine-safety-and-health-review-commission', // the statute's "Mine Enforcement Safety and Health Review Commission"
  'national-labor-relations-board',
  'nuclear-regulatory-commission',
  'occupational-safety-and-health-review-commission',
  'postal-regulatory-commission',
  'securities-and-exchange-commission',
  'consumer-financial-protection-bureau', // the statute's "Bureau of Consumer Financial Protection"
  'financial-research-office', // Office of Financial Research; FR parent: Treasury
  'comptroller-of-the-currency', // Office of the Comptroller of the Currency; FR parent: Treasury
])

/** Agencies of the legislative branch that publish in the FR (the Library of Congress with its Copyright Office and
 * Copyright Royalty Board/Judges, GAO, GPO, CBO, the Architect of the Capitol, and MedPAC, "established as an agency
 * of Congress" by 42 U.S.C. 1395b-6(a), text checked 2026-10-02 at law.cornell.edu).
 * Known gap (review FR-8): the U.S.-China Economic and Security Review Commission (FR slug
 * u-s-china-economic-and-security-review-commission) has congressionally appointed members, but its statute
 * (22 U.S.C. 7002) names no branch, so it is not listed and falls to the executive default until a citable source is
 * found. */
export const LEGISLATIVE_BRANCH_SLUGS: ReadonlySet<string> = new Set([
  'library-of-congress',
  'copyright-office-library-of-congress',
  'copyright-royalty-board',
  'copyright-royalty-judges',
  'government-accountability-office',
  'government-publishing-office',
  'congressional-budget-office',
  'architect-of-the-capitol',
  'medicare-payment-advisory-commission', // 42 U.S.C. 1395b-6(a): "an agency of Congress"
])

/** Agencies of the judicial branch that publish in the FR. The Sentencing Commission is "an independent commission in
 * the judicial branch" (28 U.S.C. 991(a)). */
export const JUDICIAL_BRANCH_SLUGS: ReadonlySet<string> = new Set([
  'administrative-office-of-united-states-courts',
  'judicial-conference-of-the-united-states',
  'united-states-sentencing-commission',
])

/** Precedence when a document lists agencies from more than one group: legislative, judicial, independent, executive. */
export function frBranch(isPresidentialDocument: boolean, agencySlugs: readonly string[]): Branch {
  if (isPresidentialDocument) return 'executive'
  if (agencySlugs.some((s) => LEGISLATIVE_BRANCH_SLUGS.has(s))) return 'legislative'
  if (agencySlugs.some((s) => JUDICIAL_BRANCH_SLUGS.has(s))) return 'judicial'
  if (agencySlugs.some((s) => INDEPENDENT_REGULATORY_SLUGS.has(s))) return 'independent'
  return 'executive'
}
