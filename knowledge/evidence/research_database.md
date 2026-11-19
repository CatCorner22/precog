# Permanent research database and citation tracing

The plugin uses a persistent, private, user-scoped database. A research session is an explicit recorded unit of work, not a claim that ChatGPT is continuously running in the background. Database procedures apply whenever this workflow and its tools are available.

## Start every research session

1. Call research_status and begin_research with topic and keywords before substantive new research. Review matching studies, prior grades and versions, recent sessions, unresolved questions, prior searches, and citation frontiers. If no matches exist, record a new scope rather than pretending prior research exists.
2. Retrieve relevant existing study and source entries before reusing their conclusions. Check the latest review date, evidence depth, corrections, publication status, and unresolved retrieval needs. A prior stored claim is not automatically true or current.
3. Identify what the new question adds. Reuse verified extraction where suitable; revisit a source when it may have changed, was only partially inspected, conflicts with newer evidence, or is central to a new claim.
4. Record searched keywords, databases, exact queries, dates, filters, result counts when available, and selection reasons. Preserve failed searches as bounded attempts, not proof of no evidence.

## Every examined study gets an entry

Store title, full author list when retrieved (otherwise mark it partial), publication and trial dates as separately named fields, DOI/PMID/NCT and related-report identifiers, keywords, study purpose, population, design, arms/comparators, outcomes/time, authors' material claims, extracted quantitative results, analysis provenance, source locators and inspected depth, and separate design/results/conclusion grades with reasons. Preserve null or unknown fields rather than inventing dates or identities.

Deduplicate using DOI or PMID for an individual report. NCT links reports belonging to a trial but must not automatically merge distinct publications, long-term follow-ups, or protocols into one report. If identifiers conflict, resolve them before overwriting. For a record without identifiers, compare normalized title, year, and authors, retaining an explicit ambiguity flag.

Store versions with review time and change reason. Use optimistic version checks so parallel work cannot silently overwrite an assessment. When the same report appears in a new session, link the existing entry and update only verified changes. The database is a working evidence register, not an immutable assertion that a previous grade was correct.

## Follow sources cited by sources

For each decisive claim, inspect its actual citation and retrieve the cited source. Then inspect that source's cited support where needed to reach the original data, foundational method, or controlling authoritative document. A minimum starting strategy is the paper's cited source and one additional generation for consequential indirect claims. Continue deeper if the claim remains dependent on secondary assertions; stop when the primary evidence is reached and adequately assessed, a cycle appears, the reference is irrelevant, or lawful access is exhausted. Explain and queue access-limited unresolved links.

Use get_references to discover indexed PubMed reference or citing-paper relationships when available. Citation databases are incomplete and links do not identify the exact supporting claim. Verify the reference number, DOI/title, and cited passage against the actual paper. Read context for both the citing claim and cited source. Distinguish bibliographic presence, secondary assertion, direct data, methods justification, contradiction, and unsupported citation.

Store each citation edge with from/to identifiers, claim under examination, source locator, depth, relationship, retrieval status, support judgment, and uncertainty. Prevent cycles and repeated retrieval using stable identifiers. Preserve a frontier of unresolved references. A citation that exists is not necessarily relevant, accurately summarized, or independent of another source.

Check common citation failures: a review cites another review without reaching data; a claim is broader than its cited population/outcome; association becomes causation in retelling; confidence disappears from a headline; a reanalysis is treated as independent replication; a reference is corrected or retracted; a methods recommendation is presented as binding law; and a citation refers to a draft superseded by a final document.

## Before concluding every session

Save new/updated study and source entries, citation edges, search records, actual analyses, and unresolved questions. Re-read the consequential saved entries and compare them with the final answer. Finish with end_research only after required writes succeed; it stores a durable session summary and remaining work. Export the database when a portable checkpoint is useful. Report the actual saved count/status, not an assumed success.

If the database is unavailable, continue useful authorized read-only research, retain a clearly labeled pending checkpoint through the host's durable file workflow when available, and say that database synchronization remains incomplete. Do not silently substitute chat memory, localStorage, or an unsaved scratch file for the database. Do not claim maintenance outside sessions where this plugin is available, and do not promise background monitoring without an authorized automation.

## Data minimization

Store public study metadata and original appraisal notes, brief necessary quotations, provenance, and authorized aggregate inputs. Do not copy entire copyrighted papers merely to build the register. Do not store identifiable patient data, credentials, or unrelated personal information. User-specific rows are isolated by the authenticated Site identity; broad exports and changes must retain that boundary.
