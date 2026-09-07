# scene-legibility Specification

## Purpose
Faire que la scène (le panneau de droite) présente toujours un contenu utile et
honnête — jamais un vide blanc qui lit « cassé » — à travers les états de
l'atelier : avant un run (intro), pendant (graphe, porte, application), et quand
l'application n'a rien posé. Remonter le fork et son pourquoi dans la scène, sans
jamais introduire de cinquième zone ni de faux squelette.

## Requirements

### Requirement: The scene explains the workshop before any run
Before a run has started, the scene SHALL present a static introduction naming
the three beats of the workshop (describe a need → agents build it live → fork
the trajectory to test a fix before prod). This introduction SHALL disappear as
soon as the run starts, and SHALL NOT imitate run content (no fake graph, no
skeleton, no progress bar).

#### Scenario: First load shows the intro, not a void
- **WHEN** the page loads and no run has started
- **THEN** the scene shows the three-beat introduction
- **AND** the scene does not render an empty application frame or a blank panel

#### Scenario: The intro yields to the run
- **WHEN** a run starts
- **THEN** the introduction is removed
- **AND** the scene shows the live graph

### Requirement: An empty application never shows a blank frame
When the run's posted screen has no markup, the scene SHALL show a named, honest
empty state (for example « l'application n'a encore rien posé ») instead of a
blank application frame that implies a working product.

#### Scenario: Screen posted with no markup
- **WHEN** the run has produced an application but its screen markup is empty
- **THEN** the scene shows the honest empty-application state
- **AND** it does not present a blank framed area that implies a working application

### Requirement: The fork gesture and its why are visible in the scene
When a run is forkable, the scene SHALL surface the fork gesture with a one-line
reason (test a fix on the real failed trajectory before prod). Once the fork view
is open, it SHALL state the intra-runtime honesty caveat.

#### Scenario: A forkable run offers the fork with its reason
- **WHEN** the run is forkable
- **THEN** the scene presents the fork gesture labeled with its purpose

#### Scenario: The open fork states the honesty caveat
- **WHEN** the fork view is open
- **THEN** it states that rollback is intra-runtime — it prevents before an
  external effect, it does not repair after

### Requirement: The scene never becomes a fifth zone
All divergence and fork UI SHALL live inside the scene pane. The redesign SHALL
NOT add a new top-level zone beyond the four (brand+status, conversation,
composer, scene).

#### Scenario: Fork stays inside the scene
- **WHEN** a fork is active
- **THEN** the two diverging panels render within the scene pane
- **AND** no fifth top-level zone is introduced
