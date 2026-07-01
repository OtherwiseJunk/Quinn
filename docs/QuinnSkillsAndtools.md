# Quinn Skills & Tools — Design

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan

## Goal

Slim Quinn's system prompt and level up her capabilities by:
1. Migrating from the hand-rolled JSON response envelope to native Groq tool calling.
2. Refactoring E2B code execution into that tool framework.
3. Adding web search (via Groq's built-in tools, routed through compound-mini).
4. Adding per-user toggleable behavior skills (first: caveman mode).

## Architecture: two separate subsystems

**Capability tools** — native Groq tools the model invokes. Registry-driven, always
available (some env-gated, e.g. `run_code` requires the E2B key). These are actions.

**Behavior skills** — per-user toggled prompt fragments (caveman first). No tools, no
new capability, pure system-prompt injection. Stored server-side like `userContext`.

The two never mix: different code paths, different storage, different toggles.

## Capability tools (full envelope migration)

`response_format: json_object` and the schema block in `buildSystemMessage` are
removed. The system prompt shrinks to personality + rules only. Every action becomes
a native tool definition:

| Tool | Args | Replaces |
|------|------|----------|
| `reply` | `content`, `thought` (required), `response_type` | content / thought_process / response_type |
| `react` | `emoji` | should_react / reaction_emoji |
| `remember` | `scope` (`user`\|`self`), `content[]` | new_memories / new_self_memories |
| `forget` | `ids[]` | delete_memories |
| `update_memory` | `id`, `content` | update_memories |
| `timeout` | `reason` | timeout_user |
| `run_code` | `language` (`python`\|`javascript`\|`bash`), `code` | run_code |
| `web_search` | `query` | (new capability) |

- **Silence** = the model calls no `reply()`. It may still call `remember()` etc.
  The pre-model `shouldRespond()` gate is unchanged.
- `QuinnResponse` is retired, replaced by a `ResolvedActions` struct assembled from
  tool calls during the loop.
- `thought` is a **required** parameter of `reply()`. When a channel has
  `displayThoughts` enabled, thoughts are mandatory; schema-level requirement is the
  simplest guarantee and costs only a few tokens when thoughts are off.

## Agentic loop

New `runAgentLoop` in `groqClient.ts`, replacing the single-call + bespoke two-pass.
The loop supports two model slots (see Model choice): an **orchestrator** that runs
tool decisions and a **reply model** that generates prose. When both slots hold the
same model, the flow collapses to single-model and `reply()` carries content
directly.

```
step = 0; actions = {}
view = (split mode) ? text-only messages (image parts -> "[user posted an image]")
                    : full multimodal messages
while step < MAX_STEPS (4):
  r = groq(orchestratorModel, view, tools=registry, tool_choice="auto")
  if no tool_calls: break          // bare text content is DISCARDED (logged)
  for each tool_call:
    reply/react/remember/forget/update_memory/timeout
        -> collect into actions, append ack as tool result
    run_code   -> execute via E2B, append result as tool result
    web_search -> compound-mini side call, append result as tool result
  step++
if actions.reply requested AND split mode:
  r = groq(replyModel, full multimodal messages + tool results, forced reply())
  -> content + thought from reply model
apply actions: react, persist memories, discipline, send reply
```

In split mode the orchestrator's `reply` tool is the intent-only variant
`request_reply(response_type)`; content and the (required) `thought` always come
from the reply model, which sees the full image context. Silent and react-only
turns never invoke the reply model.

### Loop rules

1. **Bare text discard.** A turn with assistant `content` but no `tool_calls` is
   treated as silence: discarded and logged. No coercion into a reply.
2. **Reply/result-tool conflict.** If one batch contains `reply()` AND a
   result-producing tool (`run_code`, `web_search`): drop the reply, optionally send
   a generic status message ("*running some code…*"), execute the tool, continue the
   loop. The model must reply only after seeing results.
3. **MAX_STEPS exhaustion.** If the cap is hit with no `reply()` collected, make one
   final forced call with `tools` restricted to `reply` and `react` so the user isn't
   left with a dead typing indicator.
4. **Timeout requires reply.** `timeout()` without `reply()` in the final action set
   → re-prompt requiring a reply. Discipline text (warning / timeout notice) is
   appended to reply content, as today.
5. **Malformed tool calls.** Invalid args (bad enum, missing field, unparseable
   JSON) → append an error tool-result and let the model retry within the step
   budget. Never throw the whole message away on one bad call.

Every Groq call in the loop is metered into `groqUsages` as today.

## Model choice

Two env-configurable slots, both defaulting to `llama-4-scout-17b-16e-instruct`:

- `GROQ_ORCHESTRATOR_MODEL` — runs the tool loop (action decisions, tool sequencing).
- `GROQ_REPLY_MODEL` — generates reply content + thought, sees full image context.

Equal slots = single-model flow (Phase 1 default). Target end-state after testing:
orchestrator = `gpt-oss-120b`, reply = scout. Config flip, one-line rollback.

### Constraints and reasoning

- Quinn requires **vision** (image attachments — `collectImageUrls`), including
  images in fetched history, so the reply model must be a vision model. Groq's only
  affordable vision + tools model is scout (`llama-4-maverick` deprecated Feb 2026;
  `qwen3.6-27b` has vision + tools but at $0.60/$3.00 per 1M tokens — 6–9× scout —
  it's disqualified on cost).
- Groq's vision docs explicitly confirm scout supports tools + images in one
  request. Still smoke-test during Phase 1.
- Scout's 17B active params mean imperfect schema adherence (plain text instead of
  tool calls, wrong arg types, hallucinated tool names). Loop rules 1 and 5 absorb
  this; expect single-digit-% misfire rates.
- `gpt-oss-120b` is the platform's strongest tool-caller at near-scout price, but
  has **no vision** — hence orchestrator-only, fed a text-only view with
  `[user posted an image]` placeholders.
- Fixed roles avoid voice drift: reply prose always comes from one model, action
  judgment always from one model. Known limitation: the orchestrator cannot make
  image-*content* decisions (e.g. remembering a fact visible only in a photo).
- `gpt-oss-120b` is a **reasoning model**: it emits hidden chain-of-thought tokens
  before tool calls. Those are billed as output tokens (so real output cost runs
  ~2–5× the visible tool-call JSON; still fractions of a cent) and add ~0.5–1s
  latency per orchestrator call. `reasoning_effort` (low/medium/high) tunes the
  depth; start low/medium. Requires hands-on testing before it lands on main.

### Pricing (per 1M tokens)

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| `llama-4-scout` | $0.11 | $0.34 | default both slots; end-state reply model |
| `gpt-oss-120b` | $0.15 | $0.60 | end-state orchestrator; no vision; reasoning tokens billed as output |
| `qwen3.6-27b` | $0.60 | $3.00 | vision + tools, but ~6–9× scout cost — **disqualified** |

Typical turn (~3K prompt / 300 output tokens): scout ≈ $0.0004, gpt-oss ≈ $0.0006.
Split mode adds exactly one reply-model call per replying turn (~$0.0004); silent
and react-only turns pay nothing extra.

## E2B refactor

`executeCode()` in `e2b/sandbox.ts` is kept as-is. What changes:

- `run_code` stops being an envelope field; it's a tool the loop dispatches.
- Results return as native `role: "tool"` messages instead of the hand-built
  second-pass user message.
- `buildSecondPassMessages`, `handleCodeExecution`, and `validateRunCode` are deleted
  (validation moves to the generic tool-arg validator).
- Env gating unchanged: no E2B key → `run_code` simply absent from the tool registry.

## web_search routing

Scout cannot call Groq built-in tools (compound/gpt-oss only). So `web_search` is a
normal tool whose **executor** makes a side call:

```
scout -> tool_call web_search("query")
Quinn -> groq.chat.completions.create({ model: "groq/compound-mini", ... })
      -> text + citations returned as tool result
scout -> reply(...)
```

- Same Groq API key, no new secret.
- Metered as its own Groq call; `estimateCost` needs a compound-mini pricing branch.
- New module: `groq/webSearch.ts`.

## Behavior skills (caveman)

- **Scope: per-user.** A user toggles caveman for Quinn's replies *to them*. The
  fragment resolves off `message.author.id` (a message has one author).
- Server-side per-user field `behaviorSkills: string[]`, mirroring `userContext`
  storage (`getUserContext` / `updateUserContext` pattern, global per-user).
- Skill definitions in `packages/bot/src/skills/registry.ts`: `id`, `label`,
  `promptFragment`. Caveman is the first entry.
- `/skill list | on <id> | off <id>` slash command, mirroring `/context`.
- `buildSystemMessage` appends enabled fragments **after** `serverPrompt`, so the
  per-user style wins ordering disputes.

## Type & data changes

- `shared/types/groq.ts`: retire `QuinnResponse`; add `ResolvedActions`,
  `ToolExecResult`. `GroqRequestContext` gains `behaviorFragments?: string`.
- Server: user table gains `behavior_skills`; new getter/setter + API route;
  `getContextBundle` returns fragments.

## Known costs / risks

- **Cost ceiling rises**: 1 call/message today → up to 4 loop calls + possible
  compound-mini call. `responseRate` channels multiply this. MAX_STEPS is the cap;
  monitor via existing usage metering.
- Remote MCP was researched and deliberately deferred: native tools need no hosting
  or extra hop. MCP becomes interesting later for third-party skill servers.
- Groq built-in code_interpreter rejected: requires gpt-oss/compound (no vision),
  Python-only. DIY E2B keeps js/bash + control.
- Phase 1 is "functionally equivalent" rather than provably behavior-preserving;
  verified by unit tests + manual smoke, not side-by-side evals.

## Testing (TDD throughout)

- Tool registry: defs valid, env gating (`run_code` absent without E2B key),
  `reply` vs `request_reply` variant selection by mode.
- Loop (mock Groq): tool→result→reply chain; MAX_STEPS + forced final call; silence
  (no tool calls); bare-text discard; reply+run_code conflict rule; malformed-args
  retry; timeout-requires-reply re-prompt.
- Split mode: text-only view construction (image parts → placeholder); reply-model
  call receives full multimodal context + tool results; silent/react-only turns
  skip the reply model; equal slots collapse to single-model flow.
- Skill fragments: resolution, ordering after serverPrompt.
- `webSearch` executor (mock compound-mini call).
- Slim prompt builder; update existing `buildMessages` / `groqClient` tests.

## Phasing

1. **Tool registry + agentic loop + envelope→actions migration**
   (reply/react/memory/timeout). No new capability. Includes both model env vars
   (defaulting to scout, i.e. single-model flow) with the split-mode seam built
   into the loop, plus the scout images+tools smoke test.
2. **E2B → tool executor.** Delete second-pass machinery.
3. **web_search executor** via compound-mini + cost metering branch.
4. **Behavior skills**: server storage + API, `/skill` command, caveman fragment.
5. **Orchestrator flip**: hands-on testing of `gpt-oss-120b` as orchestrator
   (tool adherence, `reasoning_effort` tuning, latency), then flip
   `GROQ_ORCHESTRATOR_MODEL` in config. Not gated on phases 2–4.
