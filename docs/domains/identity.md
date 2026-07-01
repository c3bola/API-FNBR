# Identity Domain

## Purpose

The Identity domain is responsible for representing people within the FNBR platform.

This domain provides a unified identity model used by all platform systems.

Every platform feature ultimately interacts with users through this domain.

---

# User

A user represents a person known by the platform.

Users are identified through their Telegram account.

A user may:

* participate in community resources;
* subscribe to platform services;
* participate in raffles;
* interact with platform systems;
* receive moderation actions;
* access exclusive features.

A user exists independently of any specific system.

---

# Permissions

Permissions define which actions a user is allowed to perform.

Permissions are assigned individually and may vary according to platform needs.

Examples:

* manage gamification content;
* manage raffles;
* manage moderation resources;
* manage club resources;
* manage community resources.

Permissions allow the platform to delegate responsibilities without creating fixed administrative structures.

---

# Super Administrators

Super Administrators are trusted platform operators.

They are responsible for managing the platform and maintaining its systems.

Super Administrators have unrestricted access to all platform capabilities.

Responsibilities may include:

* platform administration;
* permission management;
* community management;
* operational oversight.

---

# Managers

Managers are users who receive specific permissions to help operate a particular platform area.

Managers only receive permissions required for their responsibilities.

Examples:

* content management;
* player management;
* raffle management;
* future operational activities.

Manager capabilities are determined by permissions.

---

# Identity Ownership

The Identity domain owns:

* users;
* user identity;
* permissions;
* administrative capabilities.

The Identity domain provides identity information to all other domains.

---

# Domain Relationships

The Identity domain is shared by all platform domains.

Examples:

* Community uses users.
* Club uses users.
* Moderation uses users.
* Raffles use users.
* Gamification uses users.
* Players uses users.

A user should exist only once within the platform.

---

# Out of Scope

The Identity domain does not manage:

* subscriptions;
* benefits;
* moderation records;
* raffle participation;
* player registrations;
* community resources;
* operational logs.

These concerns belong to their respective domains.

# User Lifecycle

Users progress through a lifecycle.

Examples:

* active;
* disabled;
* archived;
* future user states.

Lifecycle states determine whether a user may participate in platform activities.

Historical user information may remain available after lifecycle changes.

---

# Identity Ownership

The Identity domain owns user identity information.

Identity information represents the canonical representation of a user within the platform.

Other domains may reference users but do not own user identity.

---

# Permission Assignment

Permissions are assigned to users.

Permission assignments determine which actions a user may perform within the platform.

Examples:

* administrative permissions;
* management permissions;
* operational permissions;
* future permission types.

Permission assignment remains independent from the resources where permissions are exercised.

---

# Permission Lifecycle

Permission assignments progress through a lifecycle.

Examples:

* granted;
* active;
* revoked;
* future permission states.

Historical permission assignments may be preserved for auditing and operational review.

---

# Roles

Roles represent collections of responsibilities within the platform.

Examples:

* Super Administrator;
* Manager;
* future platform roles.

Roles simplify permission management but do not replace permissions.

Permissions remain the source of truth for authorization decisions.

---

# Administrative Authority

Administrative authority determines which users may manage platform operations.

Examples:

* user management;
* community management;
* moderation operations;
* content operations;
* future administrative responsibilities.

Administrative authority is derived from permission assignments.

---

# Identity Auditing

The platform may preserve identity-related history.

Examples:

* permission assignment history;
* role assignment history;
* future identity events.

Identity auditing exists to support operational review and accountability.

---

# Domain Integrations

The Identity domain provides user information to other domains.

Examples:

* Community participation;
* Club memberships;
* Moderation actions;
* Player profiles;
* Content authorship;
* future integrations.

Identity remains the source of truth for user ownership and user identification across the platform.
