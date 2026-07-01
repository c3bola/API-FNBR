# Players Domain

## Purpose

The Players domain is responsible for maintaining player profiles, player preferences, player compatibility and player discovery within the FNBR platform.

The objective of the domain is to connect compatible players, facilitate team formation and improve the quality of player interactions across the community.

---

# Player Profiles

A player profile represents a member within the player ecosystem.

Profiles contain information used to identify and describe a player.

Examples:

* Telegram information;
* player nickname;
* platform;
* preferred server;
* spoken languages.

A player may have only one active profile.

Profiles are independent from community membership and may be used across multiple platform services.

---

# Player Attributes

Player attributes describe characteristics used to improve compatibility and matchmaking.

Attributes may be public or private.

Examples:

* age range;
* gender;
* city or region;
* communication preferences;
* future profile attributes.

Private attributes may be used by matching algorithms without being publicly displayed.

The platform must support evolving attributes without requiring changes to the domain model.

---

# Profile Visibility

Player information may have different visibility levels.

Examples:

* public information;
* community-only information;
* private information used internally.

Visibility rules determine what information can be displayed and what information is used exclusively for compatibility calculations.

---

# Player Preferences

Player preferences describe how a player likes to play.

Preferences may vary across different game modes.

Examples:

* looking for teammates;
* completing quests;
* training;
* competitive play;
* casual play;
* future gameplay preferences.

Preferences help identify compatible players.

---

# Game Modes

A player profile may contain information for multiple game modes.

Examples:

* Battle Royale;
* Zero Build;
* Save the World;
* Creative;
* future game modes.

Each game mode may contain its own preferences, requirements and player information.

---

# Player Capabilities

Player capabilities describe what a player is able to do within a specific game mode.

Examples:

* power level;
* progression status;
* activity readiness;
* mission availability;
* future capability indicators.

Capabilities help determine player compatibility and activity suitability.

---

# Player Compatibility

Player compatibility represents how suitable two or more players are for playing together.

Compatibility may consider:

* game modes;
* language compatibility;
* server compatibility;
* player preferences;
* profile attributes;
* reputation indicators;
* future compatibility factors.

Compatibility is used to improve recommendations and player discovery.

---

# Player Discovery

The platform must support discovering compatible players.

Player discovery uses profile information, preferences, capabilities and compatibility information to identify potential teammates.

Examples:

* players looking for teammates;
* players with compatible languages;
* players with compatible game modes;
* players with compatible progression levels;
* players with compatible social preferences.

The objective of player discovery is to facilitate community interaction and team formation.

---

# Match Notifications

The platform may notify players when compatible teammates are identified.

Notifications may be generated using:

* game mode preferences;
* language compatibility;
* server compatibility;
* activity requirements;
* compatibility scores;
* future matching criteria.

Notifications help players connect without manually searching through published profiles.

---

# Player Reputation

The platform may collect feedback from player interactions.

Reputation exists to improve future recommendations and compatibility calculations.

Examples:

* interaction feedback;
* participation feedback;
* community ratings;
* future reputation indicators.

Reputation data should represent long-term player behavior rather than isolated events.

---

# Player Feedback

Feedback represents information collected after player interactions.

The platform may use structured questionnaires to collect feedback.

Examples:

* interaction quality;
* teamwork indicators;
* communication indicators;
* future evaluation criteria.

The specific questions used by the platform are configurable and may evolve over time.

Feedback contributes to player reputation but does not define the domain structure.

---

# Recommendations

The platform may generate recommendations based on compatibility and reputation information.

Recommendations aim to improve the quality of player interactions.

Examples:

* recommended teammates;
* recommended groups;
* recommended activities;
* future recommendation types.

Recommendations should prioritize compatibility and positive player experiences.

---

# Profile Publication

Player profiles may be published through community resources.

Examples:

* player directories;
* player channels;
* future discovery resources.

Publication is a presentation mechanism and does not replace player profiles.

Profiles remain the source of truth.

---

# Profile Lifecycle

Players may update their profiles over time.

Profile information should reflect current preferences and current gameplay interests.

Inactive profiles may be disabled, archived or hidden from discovery mechanisms.

---

# Responsibilities

The Players domain is responsible for:

* managing player profiles;
* managing player attributes;
* managing profile visibility;
* managing player preferences;
* managing game mode information;
* managing player capabilities;
* managing player compatibility;
* managing player discovery;
* managing player notifications;
* managing player reputation;
* managing player feedback;
* generating player recommendations;
* managing profile publication.

---

# Domain Relationships

Identity provides user information associated with player profiles.

Community provides resources where player profiles may be published.

Club may provide optional benefits related to player discovery features.

Moderation may restrict participation when a user is suspended or banned.

The Players domain is responsible for connecting compatible players and facilitating player interaction across the platform.

# Profile Lifecycle

Player profiles progress through a lifecycle.

Examples:

* active;
* hidden;
* inactive;
* archived;
* future profile states.

Lifecycle states determine whether a profile may participate in discovery, recommendations and player matching.

Historical profile information may remain available after lifecycle changes.

---

# Profile Ownership

Each player profile belongs to a single user.

The Players domain owns player profiles and all player-specific information associated with them.

Profile ownership remains stable throughout the profile lifecycle.

---

# Attribute Evolution

Player attributes may evolve over time.

Examples:

* new attributes;
* deprecated attributes;
* optional attributes;
* future profile attributes.

The platform must support attribute evolution without requiring changes to the domain model.

Historical profile information may be preserved for operational and analytical purposes.

---

# Discovery Eligibility

Not all profiles are eligible for discovery.

Discovery eligibility may consider:

* profile lifecycle state;
* profile visibility;
* moderation restrictions;
* future eligibility requirements.

The Players domain consumes eligibility information but does not own external restrictions.

---

# Recommendation Lifecycle

Recommendations progress through a lifecycle.

Examples:

* generated;
* delivered;
* dismissed;
* expired;
* future recommendation states.

Recommendations exist to facilitate player discovery and team formation.

---

# Notification Lifecycle

Notifications progress through a lifecycle.

Examples:

* created;
* delivered;
* acknowledged;
* expired;
* future notification states.

Notification lifecycle exists to support player communication and discovery workflows.

---

# Reputation Lifecycle

Reputation represents accumulated player feedback.

Reputation evolves over time as new feedback is collected.

Reputation exists to improve:

* compatibility calculations;
* player discovery;
* recommendations;
* future platform features.

Reputation remains independent from moderation actions.

---

# Compatibility Evaluation

Compatibility evaluates how suitable players are for playing together.

Compatibility may consider:

* preferences;
* attributes;
* capabilities;
* reputation;
* future compatibility factors.

The exact compatibility calculation is a business rule defined by the platform.

Compatibility exists to improve player recommendations and team formation.

---

# Feedback Management

Feedback contributes to player reputation.

Feedback may be:

* collected;
* processed;
* incorporated into reputation;
* future feedback states.

The exact feedback model remains independent from the Players domain structure.

The platform must support evolving feedback questionnaires without requiring changes to the domain model.

---

# Domain Integrations

The Players domain consumes information from other domains.

Examples:

* Identity ownership;
* Community publication resources;
* Moderation restrictions;
* future integrations.

External domains provide information used for compatibility and discovery.

The Players domain remains responsible for profiles, discovery, reputation and recommendations.
