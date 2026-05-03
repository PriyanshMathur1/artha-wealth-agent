# Artha Wealth RAG Design

This design is based on the LangChain "Chat with Your Data" pattern used in the reference repository:

- Reference repo: [ksm26/LangChain-Chat-with-Your-Data](https://github.com/ksm26/LangChain-Chat-with-Your-Data)
- Core pattern reused here:
  1. document loading
  2. document splitting
  3. embeddings and vector store
  4. retrieval
  5. question answering
  6. conversational chat with memory

The difference is that Artha Wealth is not a generic document chatbot. It is a portfolio copilot for Indian mutual fund investors, so retrieval must work across structured portfolio state, uploaded files, mutual fund metadata, risk profile answers, and compliance-safe wealth knowledge.

## Product Goal

Design Artha Wealth as a retrieval-backed AI agent that can:

- parse holdings from chat or file upload
- enrich funds with category and asset classification
- remember the user portfolio workspace
- run the risk profile questionnaire
- compare current allocation vs ideal allocation
- answer portfolio questions with grounded context
- remain compliance-safe and avoid direct buy/sell advice

## Current State

Today the app already has:

- portfolio parsing from chat and file uploads
- portfolio assessment calculations
- a LangGraph conversation wrapper
- compliance-safe prompt behavior

What it does not yet have is a real "chat with your data" retrieval layer. The current assistant mostly relies on:

- prompt context assembled from assessment summaries
- a small static knowledge block
- a few guided fallback intents

## Target Architecture

Artha Wealth should move to a hybrid RAG architecture with three context layers.

### Layer 1: Structured Portfolio Context

This is the highest-priority source because it is user-specific and deterministic.

Documents generated from current app state:

- portfolio overview document
- per-holding documents
- per-AMC exposure documents
- per-asset allocation documents
- per-sector exposure documents
- concentration-risk documents
- risk-profile summary document
- ideal-allocation comparison document

These are derived from:

- uploaded CSV/XLS/XLSX holdings
- parsed chat holdings
- `buildPortfolioAssessment(...)`
- risk questionnaire answers

### Layer 2: Fund and Market Metadata Context

This layer grounds individual schemes and categories.

Documents should include:

- scheme category
- scheme type
- AMC name
- inferred asset bucket
- inferred equity bucket
- risk flags from confidence scoring
- source provenance such as AMFI or public metadata APIs

### Layer 3: Wealth Knowledge Context

This layer provides general educational context, not user-specific facts.

Examples:

- diversification principles
- asset allocation concepts
- mutual fund category explanations
- risk profile interpretation
- concentration review heuristics
- disclaimer and compliance-safe language

## Document Model

The retriever should not index one giant blob. It should index typed documents.

Recommended document families:

1. `portfolio_overview`
2. `holding`
3. `allocation_asset`
4. `allocation_equity_subcategory`
5. `sector_exposure`
6. `amc_exposure`
7. `scheme_exposure`
8. `risk_profile`
9. `assessment_insight`
10. `knowledge_article`
11. `compliance_policy`

Each document should carry metadata:

- `userId`
- `workspaceId`
- `documentType`
- `schemeName`
- `amcName`
- `assetBucket`
- `equityBucket`
- `sector`
- `source`
- `asOf`
- `confidence`

## Loading Strategy

Following the reference repo’s "document loading" step, Artha Wealth should support these loaders:

### Uploaded Portfolio Loader

Input:

- `.csv`
- `.xls`
- `.xlsx`

Output:

- normalized holdings
- one document per holding
- one aggregate portfolio document

### Chat Holdings Loader

Input:

- pasted lines in chat
- natural language holdings text

Output:

- normalized holdings
- one document per parsed holding

### Knowledge Loader

Input:

- internal markdown files
- curated portfolio-assessment rules
- risk questionnaire copy
- compliance language templates

Output:

- reusable knowledge documents

### Metadata Loader

Input:

- AMFI or other public scheme metadata
- Yahoo Finance only where relevant

Output:

- scheme fact documents
- enrichment metadata

## Splitting Strategy

The reference repo uses chunking after loading. For Artha Wealth, chunking should be domain-aware.

Recommended chunk rules:

- holding documents: no splitting unless the narrative becomes large
- assessment documents: split by section, such as assets, sectors, concentration
- knowledge articles: split into 300 to 700 token chunks with overlap
- compliance policies: keep small and atomic

Avoid semantic drift by never mixing user portfolio facts with generic education in the same chunk.

## Retrieval Strategy

Retrieval should be route-based, not a single blind similarity search.

### Route A: Deterministic Structured Retrieval

Use for:

- current allocation
- top funds
- AMC concentration
- sector exposure
- scheme ranking
- ideal vs current comparison

This path should read structured state directly first, then optionally add retrieved supporting context.

### Route B: Hybrid Retrieval

Use for:

- "Why is my allocation risky?"
- "How should I think about offshore exposure?"
- "What does balanced mean for my profile?"

This path should combine:

- structured portfolio facts
- retrieved knowledge articles
- retrieved scheme metadata

### Route C: Knowledge Retrieval

Use for:

- educational questions
- glossary questions
- process questions

This path can rely mainly on vector retrieval over knowledge documents.

## LangGraph Agent Design

The current graph is only `ingest -> respond`.

The target graph should be:

1. `ingest_user_input`
2. `normalize_portfolio_state`
3. `classify_intent`
4. `route_retrieval`
5. `retrieve_structured_context`
6. `retrieve_vector_context`
7. `compute_assessment_if_needed`
8. `apply_compliance_guardrails`
9. `draft_answer`
10. `verify_grounding`
11. `return_answer`

### Node Responsibilities

`ingest_user_input`

- parse new chat holdings
- detect file-upload references
- extract risk answer updates

`normalize_portfolio_state`

- ensure all holdings have classification
- refresh assessment snapshot

`classify_intent`

- classify into intents like:
  - holdings ingestion
  - allocation summary
  - concentration review
  - risk profile
  - educational question
  - product guidance

`route_retrieval`

- decide whether the answer is:
  - structured only
  - structured plus vector
  - vector only

`retrieve_structured_context`

- build compact factual context from current portfolio assessment

`retrieve_vector_context`

- fetch relevant knowledge chunks and scheme metadata

`compute_assessment_if_needed`

- compute ideal allocation comparison if enough information exists

`apply_compliance_guardrails`

- remove direct buy/sell phrasing
- enforce educational framing
- append disclaimer when needed

`draft_answer`

- generate JSON answer with citations or source labels

`verify_grounding`

- reject unsupported claims
- fall back to deterministic templates for critical questions

## Model Design

The model layer should be split by job, not use one model for everything.

### 1. Parsing Model

Purpose:

- infer holdings from messy pasted chat text
- extract risk questionnaire selections from natural language

Can often be replaced by rules first, LLM second.

### 2. Retrieval / Reasoning Model

Purpose:

- answer user questions from retrieved context
- explain allocation gaps in human terms

This is the main conversational model.

### 3. Compliance Rewriter

Purpose:

- rewrite any over-assertive language
- preserve educational framing

This can be a lightweight prompt stage or a second-pass template layer.

## Suggested Prompt Contract

The answering model should receive:

- user question
- compact conversation summary
- structured portfolio facts
- retrieved knowledge snippets
- compliance rules
- response schema

It should return:

- `answer`
- `suggestions`
- `usedSources`
- `confidence`
- optional `requiresRiskProfile`

## Memory Design

Chat memory should be split into:

- short-term thread memory
- persistent portfolio workspace memory
- persistent risk profile memory

Do not rely on raw message history alone. Portfolio state should be the source of truth.

## Evaluation Design

Build an eval set for:

1. holdings ingestion accuracy
2. top-fund ranking correctness
3. asset-allocation correctness
4. concentration-alert correctness
5. risk-profile classification correctness
6. compliance-safe language adherence
7. unsupported-claim rejection

Example eval prompts:

- "What are my top funds?"
- "Am I over-allocated to equity?"
- "Why is international exposure showing zero?"
- "What should I review first?"
- "Can you tell me which fund to sell?"

The last case must refuse direct advice and redirect to portfolio review language.

## Recommended Repo Changes

### Phase 1

- keep current upload and assessment engine
- add typed RAG document schema
- add intent classifier
- add retrieval routing
- add knowledge document store

### Phase 2

- add embeddings and vector store
- index internal knowledge and scheme metadata
- add grounded answer citations

### Phase 3

- add conversation summarization memory
- add saved workspaces
- add evaluation suite for wealth-chat prompts

## Why This Fits Artha Better Than Generic RAG

The reference repo teaches generic RAG over documents. Artha Wealth needs hybrid RAG:

- structured facts for portfolio math
- retrieval for education and context
- guardrails for financial compliance

That is the right model design for this product, because the most important answers must be computed, not hallucinated.
