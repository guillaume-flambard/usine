## Purpose

Donner une source unique aux jetons de design, prouver que les copies imposées
par l'isolation des cadres coïncident, et tenir la ligne d'accessibilité que le
produit revendique.

## ADDED Requirements

### Requirement: Design tokens have a single source
The design tokens SHALL be defined once. The copies that the sandboxed frame and
the offline take-away file are forced to carry SHALL hold the same values, and a
test SHALL fail when they diverge.

#### Scenario: A token changed in one copy only
- **WHEN** a token value is changed in the host stylesheet but not in the
  sandboxed frame or the take-away template
- **THEN** the token test fails and names the diverging token

### Requirement: No orphan colour outside the token set
A colour SHALL NOT appear in a component or a stylesheet outside the declared
token set, including as a fallback value.

#### Scenario: A hardcoded fallback colour is rejected
- **WHEN** a rule declares a colour that is not a token
- **THEN** the review rejects it

### Requirement: Text meets AA contrast
Every text style SHALL meet WCAG AA contrast against the surface it is rendered
on, including secondary and label text.

#### Scenario: Secondary text on the page background
- **WHEN** secondary text is rendered on the page background
- **THEN** its contrast ratio is at least 4.5:1

### Requirement: State is never carried by colour alone
Each of the six node states SHALL keep a non-colour signal in addition to its
colour, so the graph stays readable in greyscale.

#### Scenario: The graph is read without colour
- **WHEN** the graph is rendered without colour
- **THEN** each node state remains distinguishable by its stroke, its mark or its
  label treatment

### Requirement: The page never scrolls
The application SHALL occupy the viewport height and SHALL NOT scroll, neither
horizontally nor vertically. Only the conversation thread, the canvas inside its
frame and an oversized bottom sheet SHALL scroll.

#### Scenario: The document does not scroll at the reference viewport
- **WHEN** the application is rendered at the reference viewport
- **THEN** the document scroll height does not exceed its client height
