---
name: vipower-dev-team
description: Orchestrates the vi_power full-stack agent team (server-agent, desktop-agent, mobile-agent, qa-agent) for feature work, bug fixes, or API/contract changes spanning server/, client_react/desktop/, and client_react/mobile/. Use for "add feature X to vi_power", "fix bug across server and client", "change API and update both clients", "rerun", "continue previous work", "redo just QA", "partial fix", or any task touching more than one of server/desktop/mobile. For single-file tweaks confined to one part, work directly without this skill.
---

# vi_power Dev Team Orchestrator

## Phase 0: Check Context

Check `project/.claude/skills/vipower-dev-team/_workspace/` first.

- Empty → **initial run**
- Files exist + user requests a new feature/new input → move existing `_workspace/` to `_workspace_prev_{date}/` and do a **new run**
- Files exist + user requests a partial redo/rerun ("redo just QA", "fix desktop only") → **partial rerun**: only re-invoke that agent, keep the rest of the existing `_workspace/` output

## Phase 1: Break Down the Task

Decompose the request into server/desktop/mobile/qa:

- API route/model/MQTT/WS message add or change → server-agent
- Desktop UI/pages → desktop-agent
- Mobile UI/pages → mobile-agent
- Cross-cutting change (e.g. API shape change + both clients need updates) → invoke all relevant agents

If the request only touches one area, a single-agent team is fine.

## Phase 2: Form Team and Assign Tasks

**Execution mode: agent team.**

1. `TeamCreate` with only the agents needed (server-agent, desktop-agent, mobile-agent as relevant) + always include qa-agent — shape verification is needed whenever anything changed.
2. `TaskCreate` to distribute work. Tasks depending on an API contract change should list server-agent's task as a dependency for desktop/mobile-agent's tasks.
3. Call each agent with `model: "opus"`.

## Phase 3: Self-Coordination

Team members talk directly via `SendMessage`:

- server-agent immediately notifies desktop-agent and mobile-agent of any API/WS shape change (see each agent's "Collaboration / Team Communication Protocol").
- qa-agent verifies incrementally as each agent finishes a task — not just once at the end.
- On mismatch, qa-agent messages the responsible agent directly for a fix, then re-verifies.

## Phase 4: Save Outputs

Each agent records its results in `_workspace/`:
- `_workspace/server_contract_changes.md`
- `_workspace/desktop_changes.md`
- `_workspace/mobile_changes.md`
- `_workspace/qa_findings.md`

## Phase 5: Final Report and Cleanup

Leader synthesizes the results → reports to the user: changed files, API contract changes, QA verification results (passed/unresolved items). Tear down the team created via `TeamCreate`.

After completion, offer the user a chance to give feedback (don't push for it).

## Error Handling

- If an agent gets stuck (e.g. ambiguous requirement), retry once — have it ask a clarifying question to the team. On a second failure, mark that part as missing in the report and continue with the rest.
- If qa-agent can't verify (e.g. dev server won't start), state in the report that it fell back to static comparison.
- Conflicting opinions (e.g. server-agent and desktop-agent disagree on a field name) → don't decide arbitrarily, escalate to the user.

## Test Scenarios

**Happy path:** "Add a device alarm threshold API and reflect it in both desktop/mobile UI" → server-agent adds the route + notifies the contract → desktop/mobile-agent work in parallel → qa-agent verifies incrementally → final report.

**Error path:** server-agent names the response field `thresholdKw`, but mid-task the user wants `kwThreshold` on the desktop side → qa-agent detects the mismatch → asks both sides to confirm → if no agreement, escalate to the user.