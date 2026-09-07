# ui-primitives Specification

## Purpose
Faire venir les commandes et les superpositions de l'atelier d'un seul système de
composants, pour qu'un dialogue soit un vrai dialogue, qu'un onglet soit un vrai
onglet, et qu'un test ne dépende plus d'une classe de présentation.

## Requirements

### Requirement: Dismissible overlays are real dialogs
An overlay the visitor can dismiss (node inspector, model connection panel) SHALL
be a dialog: it SHALL expose `role="dialog"`, SHALL trap focus while open, SHALL
return focus to the control that opened it when closed, SHALL close on `Escape`,
and SHALL make the content behind it inert. The shell SHALL NOT listen for keys
on the window to close them.

The human gate and the served application stay sheets in the scene, not dialogs:
the gate demands a decision rather than offering a dismissal, and the application
is what the visitor came to use. Both SHALL still take the focus when they
appear, and the gate SHALL keep its two gestures at strictly equal visual weight.

#### Scenario: Escape closes the open overlay
- **WHEN** an overlay is open
- **AND** the visitor presses `Escape`
- **THEN** that overlay closes
- **AND** focus returns to the control that opened it

#### Scenario: Background is inert while an overlay is open
- **WHEN** an overlay is open
- **THEN** keyboard navigation stays inside the overlay

### Requirement: One control system
Interactive controls SHALL come from the shared component system with named
variants. A single presentation class SHALL NOT carry several distinct roles
(disclosure, menu entry, tab, destructive action, download link).

#### Scenario: A destructive action is not a link in disguise
- **WHEN** the account erasure control is rendered
- **THEN** it is a button with the destructive variant
- **AND** it does not share its role with a navigation or disclosure control

### Requirement: Tabs expose the accessible tab contract
Tabbed views SHALL expose tabs and their panels together: each tab SHALL
reference the panel it controls, exactly one tab SHALL be focusable at a time,
and arrow keys SHALL move between tabs.

#### Scenario: Keyboard moves between run tabs
- **WHEN** focus is on the live-runs tab
- **AND** the visitor presses the right arrow key
- **THEN** focus moves to the trash tab
- **AND** the panel shown matches the selected tab

### Requirement: Tests select on stable hooks, not on styling
Browser tests SHALL locate elements through stable `data-*` attributes rather
than presentation class names, so restyling cannot break the suite.

A class the product declares in a stylesheet to hold the layout — the full-height
shell, the zones, the canvas, the graph's SVG, the panels that position the scene
from a component's scoped style — is a structural contract, and a test MAY select
on it. A class that styles nothing exists only to be selected, and SHALL be an
attribute instead.

A test SHALL NOT assert the absence of a class the product declares nowhere: such
an assertion passes whatever ships.

#### Scenario: Restyling a control does not break its test
- **WHEN** a control's presentation classes change
- **THEN** the browser tests that exercise it still locate it

#### Scenario: A product claim is asserted on the fact, not on a dead class
- **WHEN** a test states that the product shows no skeleton and no example chips
- **THEN** it asserts on what is rendered — nothing animating, and the commands
  the composer actually exposes — rather than on the absence of a class name

### Requirement: The model connection path works
Connecting a model SHALL start the run it promises. The controls that connect a
provider key or the site relay SHALL be wired to handlers that exist, and SHALL
be covered by a test.

#### Scenario: A provider key connects the model
- **WHEN** the visitor enters a provider key and confirms the consent
- **AND** activates the connect control
- **THEN** the application connects the model
- **AND** the status line reports the connected source
