# Reward Distribution Rules

## Purpose

This document defines the business rules used by the Member Rewards domain to distribute rewards fairly among eligible participants.

The objective of the reward distribution system is to provide predictable, auditable and fair benefit distribution without relying on pure chance.

These rules exist to support reward programs operated within the platform.

---

# Fair Distribution Principle

Reward distribution is based on participant prioritization rather than random selection.

The platform must prioritize participants who have received fewer rewards over participants who have already received rewards.

The objective is to distribute benefits across the eligible participant population before repeating winners whenever possible.

---

# Participant Eligibility

A participant may only participate in a reward program when all eligibility requirements are satisfied.

Examples:

* active membership when required;
* no disqualifying moderation restrictions;
* participation requirements defined by the reward program.

Eligibility is evaluated by the Member Rewards domain using information provided by external domains.

---

# Independent Reward Pools

Each community resource maintains its own reward history and distribution cycle.

Examples:

* Clubinho reward pool;
* future reward pools.

Reward history from one pool does not affect reward distribution in another pool.

Each pool progresses independently.

---

# Participation

A participant may enter a reward program only once.

Participation is associated with:

* participant;
* reward program;
* reward pool;
* participation date.

Participation history is permanently preserved.

---

# Winner History

Winner history is permanently preserved.

Winner history exists to support fair distribution and participant prioritization.

Historical winners remain part of the distribution model even after memberships expire or participants leave the platform.

Winner history must never be reset automatically.

---

# Participation History

Participation history is permanently preserved.

Participation history contributes to participant prioritization and auditing.

Historical participation remains valid even when a participant temporarily leaves a reward pool.

---

# Participant Continuity

Participants retain their historical participation information.

Examples:

* participant leaves and later returns;
* participant membership expires and is renewed;
* participant temporarily becomes ineligible.

Historical participation and winner information remain preserved.

Returning participants do not restart their reward history.

---

# Distribution Cycle

A distribution cycle represents the process of prioritizing participants who have received fewer rewards.

The objective of a cycle is to maximize reward distribution across eligible participants before repeating winners whenever possible.

Cycles are logical business concepts.

Cycles do not require explicit administrative management.

---

# Winner Prioritization

Participants are prioritized using historical information.

Priority is determined using the following order:

1. Lowest number of historical victories.
2. Highest participation seniority.
3. Longest time since last victory.
4. Deterministic ordering.

Participants with fewer victories always receive higher priority than participants with more victories.

---

# Participation Seniority

Participation seniority represents accumulated participation history within a reward pool.

Seniority is preserved even when a participant temporarily leaves and later returns.

Seniority exists to support fair distribution among long-term participants.

The exact seniority calculation is owned by the Member Rewards domain.

---

# Deterministic Ordering

When all prioritization criteria are equal, a deterministic ordering must be used.

Deterministic ordering exists to guarantee reproducible and auditable results.

Winner selection must always produce the same result when executed with identical inputs.

---

# New Participants

New participants enter the prioritization process immediately.

New participants participate according to the same prioritization rules applied to all other participants.

Existing winner history and participation history remain valid.

The arrival of new participants does not reset existing prioritization information.

---

# Membership Changes

Membership changes do not remove historical participation information.

Examples:

* membership expiration;
* membership renewal;
* temporary inactivity.

Historical reward information remains preserved.

Only current eligibility status changes.

---

# Simultaneous Reward Programs

Multiple reward programs may exist simultaneously within the same reward pool.

Each reward program maintains its own participation list.

Winner selection must consider the current reward history of the pool.

A participant selected as a winner becomes lower priority for subsequent selections.

---

# Auditing

Reward distribution must be auditable.

The platform must preserve:

* participant history;
* winner history;
* eligibility decisions;
* prioritization information;
* reward results.

Historical records exist to support transparency and operational review.

---

# Prohibited Distribution Models

The platform must not rely exclusively on random selection.

Examples:

* pure lottery systems;
* unrestricted random winner selection;
* winner selection that ignores historical distribution.

Randomization may be used only as an implementation detail when supported by the prioritization rules.

Randomization must never override fair distribution principles.

---

# Distribution Ownership

The Member Rewards domain owns:

* participation history;
* winner history;
* participant prioritization;
* reward distribution;
* winner selection.

Other domains may provide eligibility information but do not influence reward prioritization.

---

# Architectural Goal

The reward distribution model exists to ensure:

* fair benefit distribution;
* predictable behavior;
* auditable results;
* participant continuity;
* long-term reward rotation.

The platform prioritizes equitable distribution of benefits across eligible participants before repeating winners whenever possible.
