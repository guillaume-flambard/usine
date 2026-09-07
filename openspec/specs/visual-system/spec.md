# visual-system Specification

## Purpose
Laisser la bibliothèque porter les jetons, prouver que les copies imposées par
l'isolation des cadres coïncident, et tenir la ligne d'accessibilité que le
produit revendique.

## Requirements

### Requirement: The product declares no design token of its own
The design tokens SHALL come from the component library. The product SHALL NOT
declare a colour, a radius, a font or a shadow of its own, so that there is no
second source to keep in step. The only exception is a token the library has no
opinion about, and it SHALL be declared once.

#### Scenario: A component declares its own colour
- **WHEN** a component or a stylesheet declares a colour outside the library's
  semantic utilities, including as a fallback value
- **THEN** the review rejects it

### Requirement: The frames' forced copies agree
The sandboxed frame and the offline take-away file have an opaque origin: no
stylesheet can reach them, so each carries its own copy of the tokens it needs.
Those copies SHALL hold the same values, and a test SHALL fail when they diverge,
naming the token.

#### Scenario: A token changed in one copy only
- **WHEN** a token value is changed in the sandboxed frame but not in the
  take-away template
- **THEN** the token test fails and names the diverging token

### Requirement: Text meets AA contrast, in both themes
Every text style SHALL meet WCAG AA contrast against the surface it is rendered
on, including secondary and label text, in the light theme and in the dark one.
A single accent shade need not clear AA on both grounds: the product MAY declare
one shade per theme, which is what it does.

#### Scenario: Secondary text on the page background
- **WHEN** secondary text is rendered on the page background, in either theme
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
