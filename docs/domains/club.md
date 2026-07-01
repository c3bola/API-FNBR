# Club Domain

## Purpose

The Club domain is responsible for managing subscriptions and subscriber benefits within the FNBR platform.

The Club provides access to exclusive resources and capabilities available only to subscribed members.

Benefits are associated with users and may be consumed across the platform according to the rules defined by their active plan.

---

# Membership

A membership represents an active Club subscription.

A user may have only one active membership at a time.

Membership duration is measured in days.

Additional subscription periods extend the current membership duration instead of creating multiple active memberships.

Examples:

* 15 remaining days
* additional 30-day subscription
* resulting duration: 45 remaining days

---

# Subscription Period

Memberships are time-based.

Each subscription period contributes to the total active membership duration.

The Club domain is responsible for determining:

* start date;
* expiration date;
* remaining days;
* active status.

---

# Plans

Plans define the benefits available to subscribers.

Plans are configurable and may evolve over time.

Examples:

* Plan 3
* Plan 4
* Plan 5

Future plans may be introduced without changing the structure of the domain.

Each active membership is associated with a single plan.

---

# Benefits

Benefits represent capabilities granted by a plan.

Benefits are configurable and independent from platform systems.

Examples:

* Daily Message Pinning
* Content Promotion
* Exclusive Resource Access
* Custom Tags
* Future Subscriber Features

Benefits should be reusable across multiple platform domains.

---

# Benefit Configuration

Benefits may define configurable values.

Examples:

### Daily Message Pinning

Plan 3

* 2 uses per day

Plan 4

* 3 uses per day

Plan 5

* 4 uses per day

---

### Content Promotion

Each plan may define its own daily allowance.

Benefit values are determined by plan configuration.

The platform must support changing benefit values without changing business rules.

---

# Benefit Usage

Benefits may define usage limits.

The Club domain is responsible for tracking benefit consumption and validating whether a user can consume a benefit.

Examples:

* remaining daily message pins;
* remaining content promotions;
* future limited-use benefits.

Usage tracking exists to enforce benefit limits and determine benefit availability.

---

# Subscription Evidence

A membership period may be granted based on subscription evidence.

Evidence exists to validate subscription grants and prevent duplicate usage.

Examples:

* proof of payment;
* subscription confirmation;
* future validation mechanisms.

Each piece of evidence must be uniquely identifiable.

The platform must be capable of determining whether an evidence record has already been used to grant a membership period.

---

# Exclusive Resources

Some community resources may require an active membership.

Examples:

* subscriber-only groups;
* subscriber-only channels;
* future exclusive resources.

Eligibility is determined by the Club domain.

---

# Equal Benefit Distribution

All users subscribed to the same plan receive the same benefits.

Benefits are defined by the plan and not by the individual subscriber.

The platform should provide a consistent experience for all members of the same plan.

---

# Domain Relationships

The Club domain provides subscription information to other domains.

### Community

Controls access to subscriber-only resources.

### Moderation

Provides eligibility information for moderation-related benefits.

### Raffles

Provides eligibility information for subscriber-exclusive raffles.

### Gamification

Provides eligibility information for subscriber-exclusive features.

---

# Ownership

The Club domain owns:

* memberships;
* subscription periods;
* plans;
* benefits;
* benefit configuration;
* benefit usage;
* subscription evidence;
* subscriber eligibility.

The Club domain does not own:

* user identity;
* community resources;
* moderation actions;
* raffle execution;
* gamification features;
* operational logs.

These concerns belong to their respective domains.

---

# Out of Scope

The Club domain does not manage:

* payment providers;
* user identity;
* moderation history;
* raffle winners;
* community management;
* platform logs.

These concerns belong to other domains.
# Membership Lifecycle

Memberships progress through a lifecycle.

Examples:

* active;
* expired;
* cancelled;
* future membership states.

Membership history must be preserved even after a membership is no longer active.

Lifecycle states determine benefit eligibility and access to subscriber-only resources.

---

# Subscription Periods

Membership duration is composed of one or more subscription periods.

A subscription period extends the membership expiration date.

Examples:

* 30-day subscription;
* 90-day subscription;
* annual subscription;
* future subscription durations.

Multiple subscription periods may contribute to the same membership.

Subscription periods remain part of membership history.

---

# Membership History

The platform preserves membership history.

Membership history exists to support:

* auditing;
* benefit validation;
* reward eligibility;
* future business requirements.

Historical membership information remains available even when a membership expires.

---

# Benefit Usage Cycle

Benefits may define usage limits.

Examples:

* daily limits;
* monthly limits;
* periodic limits;
* future limit types.

Benefit usage cycles determine when benefit consumption counters are reset.

Usage history may be retained for auditing and operational purposes.

---

# Plan Evolution

Plans may evolve over time.

Plan changes must not invalidate historical membership records.

Historical memberships remain associated with the plan configuration that was active when the membership was granted.

Plan evolution exists to support future benefit changes without affecting historical records.

---

# Eligibility Integration

The Club domain exposes membership eligibility information to other domains.

Examples:

* Community access validation;
* Member Rewards eligibility;
* future integrations.

The Club domain determines membership eligibility.

Other domains consume eligibility information but do not own it.
