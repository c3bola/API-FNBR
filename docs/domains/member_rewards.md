# Member Rewards Domain

## Purpose

The Member Rewards domain is responsible for managing reward programs, participant eligibility and fair reward distribution within the FNBR platform.

The objective of the domain is to distribute rewards among eligible participants according to predefined rules and participation history.

Reward distribution prioritizes fairness and balanced reward allocation over random selection.

---

# Reward Programs

A reward program defines how participants can compete for rewards.

Each program may define:

* eligibility requirements;
* participation requirements;
* reward rules;
* winner selection rules;
* reward quantities.

Reward programs may operate independently from one another.

Examples:

* Club rewards;
* community rewards;
* group rewards;
* event rewards;
* future reward programs.

---

# Rewards

A reward represents a benefit distributed through a reward program.

A reward may contain:

* title;
* description;
* image;
* value;
* quantity;
* distribution date.

Reward details are independent from the distribution process.

---

# Participation

Users may choose whether to participate in a reward program.

Participation is voluntary.

A participant may join multiple active reward programs simultaneously.

Each participant may only have one active entry per reward program.

---

# Eligibility

Reward programs may define eligibility requirements.

Examples:

* active membership;
* participation in a specific group;
* participation in a specific community resource;
* future eligibility requirements.

Eligibility is validated before participation is accepted.

Users who do not satisfy eligibility requirements cannot participate.

---

# Winners

Reward programs may define one or more winners.

Examples:

* single winner;
* multiple winners;
* future reward distribution models.

Winner quantities are defined by the reward program.

---

# Fair Distribution

The platform prioritizes fair reward distribution.

Reward selection must not rely solely on random selection.

The objective is to distribute rewards among participants in a balanced and transparent manner.

---

# Participation History

The platform maintains participation history for all participants.

Participation history exists to support fair reward distribution.

Examples:

* participation records;
* reward history;
* winner history.

Participation history influences future reward selection decisions.

---

# Winner History

Winner history records how many times a participant has received rewards.

Winner history is a core component of reward distribution.

Participants with fewer historical wins receive higher priority than participants with more historical wins.

The platform must preserve winner history across reward programs belonging to the same participant pool.

---

# Participation Seniority

Participation seniority represents how long a participant has been involved in a reward program ecosystem.

Participation seniority is used when multiple participants have equivalent reward histories.

Participants with greater seniority receive higher priority than participants with lower seniority.

Participation seniority is independent from reward quantity and reward value.

---

# Priority Ranking

The platform calculates participant priority using predefined ranking criteria.

Priority determines reward distribution order.

Examples:

1. fewer historical wins;
2. greater participation seniority;
3. longer time since the last reward;
4. deterministic ordering.

The platform must produce a predictable and auditable ranking.

Random selection must not be the primary reward distribution mechanism.

---

# Participant Pools

Reward programs may share participant pools.

A participant pool defines the participants and reward history used during reward distribution.

Examples:

* Club participant pool;
* LEGO participant pool;
* STW participant pool;
* future participant pools.

Participant pools allow multiple reward programs to share reward history and priority rankings.

---

# Simultaneous Reward Programs

Multiple reward programs may be active simultaneously.

Examples:

* Reward Program A;
* Reward Program B;
* Reward Program C.

Participation in one program does not require participation in another.

Reward distribution must always consider the participant pool history at the time winners are selected.

---

# Reward Results

Reward results represent completed reward distributions.

Results may contain:

* reward information;
* participants;
* winners;
* distribution date;
* selection criteria used.

Reward results remain available for future consultation and auditing.

---

# Responsibilities

The Member Rewards domain is responsible for:

* managing reward programs;
* managing rewards;
* managing participant eligibility;
* managing participant pools;
* managing participation history;
* managing winner history;
* calculating participant priority;
* selecting winners;
* recording reward results;
* ensuring fair reward distribution.

---

# Domain Relationships

Identity provides participant information.

Community provides community resources used by reward programs.

Club may provide eligibility information for subscriber-only reward programs.

Moderation may restrict participation when a user is suspended or banned.

The Member Rewards domain is responsible for determining reward eligibility and reward distribution independently from other domains.

# Reward Program Lifecycle

Reward programs progress through a lifecycle.

Examples:

* planned;
* active;
* completed;
* archived;
* future program states.

Lifecycle states determine whether participation and winner selection are allowed.

Historical reward programs remain available after completion.

---

# Participation Lifecycle

Participation progresses through a lifecycle.

Examples:

* eligible;
* participating;
* selected;
* completed;
* future participation states.

Participation history remains part of the reward program history.

---

# Eligibility Evaluation

Eligibility determines whether a participant may enter a reward program.

Eligibility may consider information from other domains.

Examples:

* active membership;
* moderation restrictions;
* future eligibility requirements.

The Member Rewards domain consumes eligibility information but does not own it.

Eligibility may be evaluated before participation, during participation or during winner selection.

---

# Participant Pools

Participant pools represent collections of eligible participants.

Examples:

* community-wide pools;
* subscriber pools;
* resource-specific pools;
* future pool types.

A participant may belong to multiple pools simultaneously.

Pools exist independently from reward programs.

---

# Participation History

The platform preserves participation history.

Participation history exists to support:

* fairness;
* auditing;
* winner selection;
* future business requirements.

Historical participation remains available even after reward programs are completed.

---

# Winner History

The platform preserves winner history.

Winner history exists to support:

* fair distribution;
* participation prioritization;
* operational auditing;
* future business requirements.

Winner history remains available permanently.

---

# Participation Seniority

Participation seniority represents accumulated participation history.

Seniority contributes to participant prioritization.

The exact seniority calculation is a business rule defined by the reward program.

Seniority remains independent from the winner selection mechanism.

---

# Reward Prioritization

Reward programs may prioritize participants using historical information.

Examples:

* participation history;
* winner history;
* participation seniority;
* future prioritization factors.

Prioritization exists to support fair benefit distribution.

The prioritization model remains independent from implementation details.

---

# Winner Selection

Winner selection determines which participants receive rewards.

Winner selection operates on eligible participants and program prioritization rules.

Winner selection must be reproducible and auditable.

The exact selection algorithm is a business rule defined by the reward program.

---

# Reward Results

Reward results represent the outcome of a reward program.

Examples:

* selected participants;
* reward recipients;
* selection date;
* reward information;
* future result metadata.

Reward results remain part of the permanent history of the program.

---

# Domain Integrations

The Member Rewards domain consumes information from other domains.

Examples:

* Club eligibility;
* Moderation restrictions;
* Community participation;
* future integrations.

External domains provide eligibility information.

The Member Rewards domain remains responsible for participation, prioritization and reward distribution.

