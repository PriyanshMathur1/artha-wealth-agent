# How To Build AI Agents

This document is for beginners.

If you are new to agents, RAG, LangChain, or LangGraph, this should help you understand:

- what an agent actually is
- how to design one without overcomplicating it
- how Artha Wealth is built
- how to decide when to use rules, retrieval, and LLMs
- how to build your own agent step by step

The goal is not just to explain this project.

The goal is that after reading this, you should be able to design and build an agent of your own with a good mental model.

## 1. What Is An Agent?

Most people hear "AI agent" and think it means a magical autonomous system.

That is not the best way to think about it.

A better definition is:

An agent is a system that:

- receives input
- keeps some state
- decides what to do next
- gathers context
- produces an output

In practice, an agent is usually a workflow, not just one prompt.

A strong agent often combines:

- rules
- functions
- stored state
- retrieval
- one or more LLM calls

So the real question is not:

"How do I make the smartest prompt?"

It is:

"How do I design a system that gives the model the right job, the right context, and the right boundaries?"

## 2. The Biggest Beginner Mistake

The most common mistake is this:

People try to solve everything with a single LLM call.

Example of the bad approach:

- user asks a question
- you dump all available data into one prompt
- you hope the model figures it out

This usually fails because:

- the prompt becomes messy
- important facts get buried
- answers become inconsistent
- it is harder to test
- it is harder to debug
- it is expensive

The better approach is:

- do deterministic work with code
- do retrieval with retrieval logic
- do reasoning and language generation with the model

This is exactly how Artha Wealth was shaped.

## 3. The Core Pattern

The most useful simple pattern for agents is:

1. Ingest input
2. Normalize state
3. Classify intent
4. Retrieve context
5. Apply business logic
6. Generate answer
7. Save memory
8. Evaluate behavior

This is much better than "one giant prompt".

In Artha Wealth, that pattern looks like this:

1. User pastes holdings or uploads a file
2. We normalize holdings into a common structure
3. We classify what the user is asking
4. We retrieve relevant structured and knowledge context
5. We compute portfolio assessment when needed
6. We answer with compliance-safe language
7. We save workspace memory
8. We test with golden evals

## 4. Start With The Job To Be Done

Before touching LangChain or LangGraph, write down:

- who the user is
- what they want
- what the system knows
- what the system can do
- what the system must never do

For Artha Wealth:

- User: Indian mutual fund investor
- Goal: understand current allocation, risk profile, concentration, and ideal ranges
- Known data: holdings, risk answers, assessment outputs, mutual fund metadata
- Can do: parse, classify, retrieve, summarize, compare, explain
- Must not do: direct buy/sell advice

This one step is extremely important.

If you skip this, your agent will feel vague because the product itself is vague.

## 5. Think In Layers

When building agents, split context into layers.

For this project, the layers are:

### Layer 1: Structured Facts

This is the most important layer.

Examples:

- holdings
- current values
- asset allocation
- AMC concentration
- risk score

These should usually come from code, not from the LLM.

If a number can be computed, compute it.

Do not ask the LLM to "figure out" portfolio math if your code can do it directly.

### Layer 2: Retrieved Knowledge

This is where RAG helps.

Examples:

- what diversification means
- what a balanced profile means
- what offshore exposure does
- how to explain concentration risk

This is supporting context, not the source of truth for the user’s own numbers.

### Layer 3: Language Generation

This is where the model shines.

Examples:

- explaining findings clearly
- summarizing results
- answering natural language questions
- adjusting tone and phrasing

The model should explain the result, not invent the result.

## 6. Use Rules First, LLM Second

A strong beginner approach is:

- rules for easy classification
- functions for calculations
- LLM only for the fuzzy or language-heavy parts

In Artha Wealth:

- parsing some holdings is rule-based
- allocation math is code-based
- intent classification can be rule-based
- retrieval selection is code-based
- final explanation can be LLM-based

This is a very good default design.

You do not need an LLM for every step.

In fact, using fewer LLM calls usually makes your agent better.

## 7. What RAG Actually Means

RAG stands for Retrieval Augmented Generation.

That means:

- retrieve useful context first
- then ask the model to answer using that context

Bad RAG:

- dump a full database into the prompt

Good RAG:

- select only the few pieces of context needed for the question

In this project, we use a hybrid RAG pattern:

- structured retrieval for portfolio facts
- knowledge retrieval for educational explanations
- compliance context for safe language

That is better than generic document chat because portfolio agents need both:

- hard facts
- soft explanations

## 8. What LangGraph Is Good For

LangGraph is useful when your agent is a workflow with steps.

Instead of one function with lots of hidden logic, you define nodes.

In Artha Wealth, the current graph is:

- `ingest`
- `retrieve`
- `respond`

That is already a good mental model.

You can expand it later into:

- `ingest`
- `normalize`
- `classify_intent`
- `retrieve_structured`
- `retrieve_knowledge`
- `apply_business_rules`
- `respond`
- `save_memory`

Why this helps:

- easier to debug
- easier to change
- easier to test each step
- easier to understand as a team

## 9. The Best Way To Think About Memory

Beginners often think memory means "send the full chat history every time."

That is not enough.

Good agent memory has at least 3 forms:

### Short-Term Conversation Memory

Recent turns in the active chat.

Useful for:

- follow-ups
- clarifications
- local context

### Workspace State

Structured state for the current task.

Examples in this project:

- holdings
- risk answers
- latest assessment
- workspace summary

This is more important than raw message history.

### Long-Term Memory

Persistent saved context across sessions.

Examples:

- saved workspace
- user preferences
- prior uploaded portfolio

Artha Wealth already stores workspace memory locally through:

- [lib/local-wealth-store.ts](/Users/priyansh/Desktop/artha/lib/local-wealth-store.ts:1)
- [app/api/wealth/workspace/route.ts](/Users/priyansh/Desktop/artha/app/api/wealth/workspace/route.ts:1)

## 10. What We Actually Built Here

The easiest way to learn is to map theory to real code.

### A. Typed State

We define the state carried through the workflow.

See:

- [lib/wealth/types.ts](/Users/priyansh/Desktop/artha/lib/wealth/types.ts:1)
- [lib/wealth/rag-schema.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag-schema.ts:1)

This gives the system shape.

Without typed state, agents become fuzzy very quickly.

### B. Structured Business Logic

We do portfolio calculations in code.

See:

- [lib/portfolio-assessment.ts](/Users/priyansh/Desktop/artha/lib/portfolio-assessment.ts:1)

This is the right place for:

- allocation math
- concentration alerts
- risk scoring
- ideal range comparisons

### C. Retrieval Layer

We build structured documents and retrieve context from them.

See:

- [lib/wealth/rag.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag.ts:1)

This file handles:

- intent classification
- workspace summarization
- building documents
- scoring documents
- choosing context
- deterministic answers for common questions

### D. Workflow Layer

We sequence the steps with LangGraph.

See:

- [lib/wealth/assistant.ts](/Users/priyansh/Desktop/artha/lib/wealth/assistant.ts:1)

This is where we define:

- what happens first
- what happens next
- when to use deterministic logic
- when to call the model

### E. API Layer

We expose the agent through routes.

See:

- [app/api/wealth/chat/route.ts](/Users/priyansh/Desktop/artha/app/api/wealth/chat/route.ts:1)
- [app/api/wealth/workspace/route.ts](/Users/priyansh/Desktop/artha/app/api/wealth/workspace/route.ts:1)

### F. UI Layer

We connect the workflow to a user interface.

See:

- [app/chat/page.tsx](/Users/priyansh/Desktop/artha/app/chat/page.tsx:1)

### G. Evaluation Layer

We test expected behavior with golden fixtures.

See:

- [evals/wealth/run.ts](/Users/priyansh/Desktop/artha/evals/wealth/run.ts:1)
- [/Users/priyansh/Desktop/artha/evals/wealth/golden](/Users/priyansh/Desktop/artha/evals/wealth/golden)

This is one of the most important professional habits in agent building.

## 11. When To Use Deterministic Answers

Do not ask the model to answer everything.

Some questions should be answered directly from code.

Examples:

- "What are my top funds?"
- "How many schemes do I hold?"
- "Which AMC has the highest exposure?"
- "What is my equity allocation?"

These are deterministic questions.

The answer should come from structured data.

In Artha Wealth, that logic is in:

- [lib/wealth/rag.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag.ts:1)

This makes the system:

- more accurate
- cheaper
- easier to test

## 12. When To Use The LLM

Use the LLM when you need:

- explanation
- synthesis
- flexible natural language
- educational guidance

Examples:

- "Why might my allocation feel aggressive?"
- "How should I think about concentration risk?"
- "Explain ideal allocation in simpler words."

That is where the model is useful.

But even then, give it:

- the intent
- the structured facts
- retrieved knowledge
- compliance rules

This is why `buildModelPrompt(...)` exists.

## 13. Why Typed Documents Matter

Many beginners store everything as one text blob.

That works for tiny demos but breaks fast.

Typed documents are better because they let you say:

- this is a `holding`
- this is an `amc_exposure`
- this is a `knowledge_article`
- this is a `compliance_policy`

Then your retriever can choose better context.

That is why we added:

- [lib/wealth/rag-schema.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag-schema.ts:1)

## 14. A Practical Agent Design Checklist

Before building your own agent, answer these questions:

### Product

- Who is the user?
- What is the single most important job?
- What does success look like?
- What should the agent never do?

### Data

- What facts are structured?
- What facts come from uploads?
- What facts come from external APIs?
- What facts are knowledge articles?

### Workflow

- What are the steps?
- Which steps are deterministic?
- Which steps need retrieval?
- Which steps need an LLM?

### State

- What should be remembered during the session?
- What should be saved across sessions?
- What should be recomputed each time?

### Safety

- What could the model say incorrectly?
- What must be blocked or rewritten?
- Where should disclaimers appear?

### Testing

- What are the top 10 user prompts?
- What answers must always include certain facts?
- What phrases must never appear?

If you can answer these, you are ready to build.

## 15. The Best Beginner Build Order

If you want to create your own agent, do it in this order.

### Step 1: Build The Pure Logic First

Write plain functions for:

- parsing
- calculations
- validation
- normalization

Do this before adding the LLM.

### Step 2: Add Typed State

Define:

- message types
- workspace state
- response shape
- document shape

### Step 3: Add Intent Routing

Start with simple rules.

You can always upgrade later.

### Step 4: Add Retrieval

Start small:

- build documents
- rank by simple similarity
- return top context

You do not need a fancy vector database on day one.

### Step 5: Add The LLM

Only after the first four steps are solid.

### Step 6: Add Memory

Save workspace state, not just raw chat history.

### Step 7: Add Evals

Without evals, agent changes will regress quietly.

## 16. A Very Good First Personal Project

If you want to practice, copy this pattern into a smaller agent.

Good beginner examples:

- PDF study assistant
- meal planning assistant
- job application tracker
- real estate listing explainer
- CRM sales-note copilot

For each one, use the same pattern:

- input
- state
- intent
- retrieval
- business logic
- answer
- memory
- evals

## 17. What To Avoid

Avoid these habits:

- one giant prompt
- no typed state
- no evals
- letting the LLM do math
- sending too much irrelevant context
- storing only raw chat history
- building complex autonomy too early

The fastest way to improve is usually to make the system simpler and more explicit.

## 18. If You Want To Make This Project Even Better

Here are strong next steps for Artha Wealth:

1. Replace local similarity scoring with real embeddings and a vector store
2. Add citations that point to exact structured documents and knowledge chunks
3. Add a richer intent classifier
4. Add streaming responses
5. Add user-specific saved workspaces in a real database
6. Add better risk-profile dialogue inside chat
7. Expand eval coverage for refusal and compliance cases

## 19. The Main Lesson

The biggest lesson from building agents is this:

An agent is not "a clever prompt."

An agent is a product system with:

- clear state
- clear workflow
- clear boundaries
- clear data sources
- clear evaluation

If you remember only one idea from this document, remember this:

Use code for facts, retrieval for context, and the model for explanation.

That one rule will save you a lot of time.

## 20. Where To Read Next In This Repo

If you want to learn from the actual implementation, read these files in this order:

1. [docs/artha-wealth-rag-design.md](/Users/priyansh/Desktop/artha/docs/artha-wealth-rag-design.md:1)
2. [lib/wealth/rag-schema.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag-schema.ts:1)
3. [lib/wealth/rag.ts](/Users/priyansh/Desktop/artha/lib/wealth/rag.ts:1)
4. [lib/wealth/assistant.ts](/Users/priyansh/Desktop/artha/lib/wealth/assistant.ts:1)
5. [app/api/wealth/chat/route.ts](/Users/priyansh/Desktop/artha/app/api/wealth/chat/route.ts:1)
6. [app/api/wealth/workspace/route.ts](/Users/priyansh/Desktop/artha/app/api/wealth/workspace/route.ts:1)
7. [app/chat/page.tsx](/Users/priyansh/Desktop/artha/app/chat/page.tsx:1)
8. [evals/wealth/run.ts](/Users/priyansh/Desktop/artha/evals/wealth/run.ts:1)

## 21. A Final Suggestion

When you build your own agent, do not begin with the hardest version.

Build version 1 like this:

- one user problem
- one main workflow
- one or two data sources
- one saved state object
- a few eval fixtures

That is enough to learn the right habits.

Once that foundation feels natural, then add:

- better retrieval
- more tools
- more memory
- more autonomy

That is the best approach.
