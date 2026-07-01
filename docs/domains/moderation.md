# Moderation Domain

## Purpose

The Moderation domain is responsible for enforcing community policies, protecting community resources and managing member restrictions across the FNBR platform.

Moderation operates at the community level rather than at the individual resource level.

Restrictions applied to a user are valid throughout the entire community.

---

# Community Moderation

Moderation is centralized.

A moderation action applied to a user affects all community resources where the user participates.

Examples:

* community-wide warnings;
* community-wide mutes;
* community-wide bans;
* automated enforcement actions.

---

# Warnings

Warnings represent moderation infractions.

Warnings are accumulated at the community level.

Warnings do not expire automatically.

Warnings remain associated with the user until explicitly removed by an administrator.

The platform may use warning counts when evaluating future moderation actions.

---

# Mutes

A mute restricts a user's ability to interact with community resources.

Mutes are applied at the community level.

A muted user remains restricted across all community resources.

Mutes may be:

* temporary;
* indefinite.

Temporary mutes define a duration.

Indefinite mutes remain active until manually removed.

---

# Bans

A ban removes a user from the community.

Bans are applied at the community level.

A banned user should not be allowed to participate in any managed community resource.

Bans may be:

* temporary;
* permanent.

Ban removal requires administrative review.

---

# Restricted Content

Restricted Content defines content that is not allowed within the community.

The platform may automatically detect restricted content and apply moderation actions.

Examples:

* prohibited URLs;
* prohibited domains;
* prohibited invite links;
* future restricted content types.

Restricted content enforcement is automatic.

Moderation policies determine which actions are executed when restricted content is detected.

Examples:

* message removal;
* automatic mute;
* automatic ban;
* future enforcement actions.

---

# Automated Enforcement

The platform may automatically apply moderation actions when predefined policies are violated.

Examples:

* prohibited character sets;
* prohibited content;
* future automated detection rules.

Automated enforcement rules are configurable.

Examples:

* Arabic characters;
* Asian characters;
* Russian characters;
* future automated restrictions.

---

# Moderation Policies

Moderation behavior may be configured independently for each community resource.

Examples:

* welcome messages;
* rules verification;
* night mode;
* automated moderation rules;
* permission policies;
* content cleanup policies.

Policies determine how moderation behaves within a resource.

---

# Welcome Policies

Community resources may define welcome behavior for new members.

Welcome messages are configurable.

A welcome message may contain:

* text;
* media;
* interactive buttons;
* dynamic content.

Different welcome messages may exist for different situations.

Examples:

* standard welcome;
* restricted welcome;
* welcome for closed resources;
* future welcome variations.

---

# Member Access Validation

New members must pass validation before receiving normal participation permissions.

Validation occurs when a member joins a community resource.

Examples:

* ban verification;
* mute verification;
* warning evaluation;
* automated enforcement validation;
* rules verification.

Access decisions are determined by moderation policies.

---

# Rules Verification

Community participation may require compliance with predefined requirements.

Examples:

* membership in a rules resource;
* future participation requirements.

Users who do not satisfy required conditions may receive participation restrictions until compliance is achieved.

Rules verification is configurable.

---

# Permission Grants

Community resources may define permissions for new members.

Examples:

* text-only participation;
* restricted media access;
* full participation permissions.

Permissions may be granted automatically when moderation requirements are satisfied.

Restrictions always take precedence over permission grants.

---

# Restriction Enforcement

Restrictions are evaluated whenever a member interacts with the community.

Examples:

* joining a resource;
* rejoining a resource;
* requesting permissions;
* future moderation events.

The platform must consistently enforce existing restrictions across all community resources.

Examples:

* banned users are removed from managed resources;
* muted users remain restricted;
* warnings continue to be considered during moderation evaluation.

---

# Content Policies

Moderation may control how content is handled within community resources.

Examples:

* GIF expiration;
* automated content cleanup;
* future content lifecycle policies.

Content policies are configurable per resource.

---

# Moderation Exemptions

Certain users, systems or resources may be exempt from specific moderation policies.

Exemptions allow administrators to exclude specific subjects from moderation behavior.

Examples:

* exemption from content cleanup policies;
* exemption from automated moderation rules;
* exemption from access restrictions;
* future moderation exceptions.

Exemptions are configurable.

The platform must support defining which moderation policies are bypassed by each exemption.

Moderation exemptions do not remove community sanctions.

Examples:

* active warnings;
* active mutes;
* active bans.

Community sanctions always take precedence over moderation exemptions.

---

# Responsibilities

The Moderation domain is responsible for:

* enforcing community policies;
* managing warnings;
* managing mutes;
* managing bans;
* managing restricted content;
* managing automated enforcement rules;
* validating member access;
* managing permission grants;
* enforcing moderation restrictions;
* managing moderation exemptions;
* managing moderation behavior for community resources.

---

# Domain Relationships

Identity provides user information used during moderation decisions.

Community provides the resources where moderation policies are applied.

Club may provide eligibility information when moderation behavior depends on subscriber benefits.

Moderation enforces community policies independently of other domains and applies restrictions consistently across the platform.
# Moderation Lifecycle

Moderation actions progress through a lifecycle.

Examples:

* issued;
* active;
* expired;
* revoked;
* future moderation states.

Lifecycle states determine whether a moderation action currently affects a user.

Historical moderation records must be preserved even when actions are no longer active.

---

# Moderation History

The platform preserves moderation history.

Moderation history exists to support:

* auditing;
* operational review;
* community protection;
* future business requirements.

Historical moderation records remain available even when warnings, mutes or bans are no longer active.

---

# Moderation Actions

Moderation actions represent restrictions applied to users.

Examples:

* warnings;
* mutes;
* bans;
* future moderation actions.

Moderation actions may be applied manually or automatically.

Moderation actions are independent from the enforcement mechanism that created them.

---

# Action Attribution

Moderation actions are attributable.

The platform records the origin of moderation actions.

Examples:

* administrator actions;
* manager actions;
* automated enforcement actions;
* future moderation sources.

Action attribution exists to support auditing and operational review.

---

# Access Validation

The Moderation domain exposes restriction information to other domains.

Examples:

* Community access validation;
* Member Rewards eligibility validation;
* Players eligibility validation;
* future integrations.

The Moderation domain determines restriction status.

Other domains consume restriction information but do not own it.

---

# Restriction Evaluation

Restrictions may have different levels of impact.

Examples:

* informational restrictions;
* participation restrictions;
* access restrictions;
* future restriction types.

The interpretation of restriction status belongs to the consuming domain.

The Moderation domain is responsible only for determining restriction state.

---

# Moderation Decisions

Moderation actions may include operational context.

Examples:

* reason;
* enforcement source;
* creation date;
* future moderation metadata.

Moderation decisions remain part of moderation history even when actions are no longer active.
