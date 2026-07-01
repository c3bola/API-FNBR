# Integration Contracts

## Purpose

This document defines how domains exchange information while preserving ownership boundaries.

Integration contracts describe:

* information ownership;
* information consumers;
* decision ownership;
* integration responsibilities.

Integration contracts do not transfer business ownership between domains.

---

# Principles

## Ownership

Every piece of information has a single owning domain.

Only the owning domain may define, modify or validate that information.

Other domains consume information through integration contracts.

---

## Decision Ownership

Multiple domains may provide information for a decision.

Only one domain owns the final decision.

The decision owner is responsible for interpreting consumed information.

---

## Information Consumption

Domains consume facts.

Domains do not consume decisions.

Examples:

Correct:

```text
Moderation:
User is banned
```

Incorrect:

```text
Moderation:
User cannot participate in rewards
```

Participation eligibility belongs to Member Rewards.

---

# Community Admission

## Purpose

Determine whether a user may participate in a community resource.

---

## Decision Owner

```text
Community
```

---

## Consumed Information

### Identity

Provides:

* user identity;
* user state.

---

### Club

Provides:

* membership eligibility.

---

### Moderation

Provides:

* restriction status.

---

## Decision

Community determines:

* allow participation;
* deny participation;
* apply participation conditions.

Community owns the final admission decision.

---

# Membership Eligibility

## Purpose

Determine whether a user has an active subscription membership.

---

## Decision Owner

```text
Club
```

---

## Consumed Information

### Identity

Provides:

* user identity.

---

## Decision

Club determines:

* eligible;
* not eligible.

Eligibility remains owned by Club.

---

# Restriction Status

## Purpose

Determine whether moderation restrictions are active.

---

## Decision Owner

```text
Moderation
```

---

## Consumed Information

### Identity

Provides:

* user identity.

### Community

Provides:

* resource context.

---

## Decision

Moderation determines:

* restriction exists;
* restriction type;
* restriction state.

Restriction status remains owned by Moderation.

---

# Reward Participation Eligibility

## Purpose

Determine whether a user may participate in a reward program.

---

## Decision Owner

```text
Member Rewards
```

---

## Consumed Information

### Club

Provides:

* membership eligibility.

### Moderation

Provides:

* restriction status.

### Community

Provides:

* participation information.

---

## Decision

Member Rewards determines:

* eligible;
* ineligible.

Reward participation eligibility remains owned by Member Rewards.

---

# Winner Selection

## Purpose

Determine reward recipients.

---

## Decision Owner

```text
Member Rewards
```

---

## Consumed Information

### Club

Provides:

* membership information.

### Moderation

Provides:

* restriction status.

### Community

Provides:

* participation information.

---

## Decision

Member Rewards determines:

* participant prioritization;
* reward recipients.

Winner selection remains owned by Member Rewards.

---

# Discovery Eligibility

## Purpose

Determine whether a player profile may participate in discovery.

---

## Decision Owner

```text
Players
```

---

## Consumed Information

### Moderation

Provides:

* restriction status.

### Identity

Provides:

* user information.

---

## Decision

Players determines:

* discoverable;
* hidden;
* restricted.

Discovery eligibility remains owned by Players.

---

# Player Recommendations

## Purpose

Determine compatible players.

---

## Decision Owner

```text
Players
```

---

## Consumed Information

### Moderation

Provides:

* restriction status.

### Community

Provides:

* publication resources.

---

## Decision

Players determines:

* compatibility;
* recommendations.

Recommendation ownership remains within Players.

---

# Content Distribution

## Purpose

Determine where content should be published.

---

## Decision Owner

```text
Content Publishing
```

---

## Consumed Information

### Community

Provides:

* distribution targets.

### Identity

Provides:

* publication ownership information.

---

## Decision

Content Publishing determines:

* target selection;
* publication distribution;
* synchronization operations.

Distribution ownership remains within Content Publishing.

---

# Subscriber Benefits

## Purpose

Determine whether a user may consume a benefit.

---

## Decision Owner

```text
Club
```

---

## Consumed Information

### Identity

Provides:

* user identity.

---

## Decision

Club determines:

* benefit eligibility;
* benefit consumption availability.

Benefit ownership remains within Club.

---

# Event Ownership

Business events are owned by the domain that owns the originating business concept.

Examples:

```text
Identity
├── UserCreated
├── UserDisabled
└── PermissionGranted

Community
├── ResourceCreated
├── MembershipCreated
└── MembershipRemoved

Club
├── MembershipActivated
├── MembershipExpired
└── BenefitConsumed

Moderation
├── WarningIssued
├── MuteApplied
└── BanApplied

Member Rewards
├── ParticipationAccepted
├── WinnerSelected
└── RewardDistributed

Players
├── ProfilePublished
├── FeedbackReceived
└── RecommendationGenerated

Content Publishing
├── PublicationCreated
├── PublicationUpdated
└── DistributionCompleted
```

---

# Responsibility Matrix

| Capability               | Owner              |
| ------------------------ | ------------------ |
| User Identity            | Identity           |
| Permissions              | Identity           |
| Community Resources      | Community          |
| Resource Memberships     | Community          |
| Subscription Memberships | Club               |
| Benefits                 | Club               |
| Restriction Status       | Moderation         |
| Reward Participation     | Member Rewards     |
| Winner Selection         | Member Rewards     |
| Player Profiles          | Players            |
| Player Discovery         | Players            |
| Publications             | Content Publishing |
| Content Distribution     | Content Publishing |

---

# Architectural Goal

The purpose of these contracts is to ensure:

* clear ownership;
* independent domains;
* predictable integrations;
* scalable architecture;
* reusable platform services.

Domains collaborate through contracts while preserving business ownership boundaries.
