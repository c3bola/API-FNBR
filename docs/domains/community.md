# Community Domain

## Purpose

The Community domain is responsible for representing the FNBR community and its official resources.

FNBR operates a single community composed of multiple resources.

This domain defines how those resources are organized and classified.

---

# Community

FNBR is considered a single community.

All official resources belong to this community.

The Community domain provides the structure that connects users to platform resources.

---

# Community Resources

A community resource represents an official space provided by the platform.

Resources may serve different purposes while remaining part of the same community.

Examples:

* groups;
* channels;
* support resources;
* operational resources;
* special access resources.

---

# Resource Types

Resources may be classified according to their purpose.

### Main Resources

Primary spaces used for community interaction and engagement.

---

### Topic Resources

Resources dedicated to specific interests, activities or experiences.

---

### Information Resources

Resources used to distribute information, announcements, rules or updates.

---

### Support Resources

Resources dedicated to providing assistance to community members.

---

### Operational Resources

Resources used to support platform operations.

---

### Special Access Resources

Resources that require specific eligibility before access is granted.

Examples:

* subscriber-only resources;
* invitation-only resources;
* future restricted-access resources.

---

# Resource Management

Community resources may be managed by other platform domains.

Examples:

* Moderation manages moderation behavior.
* Club manages subscriber-only access.
* Players manages player-related resources.

The Community domain only defines the existence and classification of resources.

---

# Membership

Users may participate in one or more community resources.

Membership is determined by platform rules and resource requirements.

Participation in one resource does not imply participation in all resources.

---

# Access Control

Some resources may require additional conditions before access is granted.

Examples:

* invitations;
* approvals;
* active subscriptions;
* domain-specific requirements.

Access requirements are defined by the owning domain.

---

# External Resources

The platform may interact with resources that are not owned by FNBR.

External resources are not considered part of the community.

The platform must distinguish between:

* official community resources;
* external resources.

---

# Ownership

The Community domain owns:

* community structure;
* resource classification;
* resource visibility;
* resource relationships.

The Community domain does not own:

* user permissions;
* subscriptions;
* benefits;
* moderation actions;
* raffles;
* player registrations;
* operational logs.

These concerns belong to their respective domains.

---

# Out of Scope

The Community domain does not manage:

* permissions;
* moderation records;
* subscription benefits;
* raffle participation;
* player data;
* platform logs.

These concerns belong to other domains.
# Resource Membership

Resource membership represents the relationship between a user and a community resource.

The Community domain owns resource membership and participation records.

Membership exists independently from the resource itself and independently from the user profile.

Examples:

* member joined a group;
* member joined a channel;
* member joined a private resource;
* member left a resource;
* member was removed from a resource.

Resource membership is the source of truth for participation within community resources.

---

# Membership Lifecycle

Resource memberships progress through a lifecycle.

Examples:

* joined;
* left;
* removed;
* future participation states.

The platform must preserve participation history even when a membership is no longer active.

Membership lifecycle exists to support moderation, auditing and community operations.

---

# Resource Lifecycle

Community resources may progress through a lifecycle.

Examples:

* active;
* disabled;
* archived;
* future resource states.

Lifecycle states determine whether a resource may participate in community operations.

Historical information should remain available after lifecycle changes.

---

# Community Ownership

The Community domain owns:

* community resources;
* resource relationships;
* resource memberships;
* participation history.

Other domains may evaluate eligibility or restrictions, but the Community domain remains responsible for managing participation within resources.
