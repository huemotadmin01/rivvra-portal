# Sequence wizard — v2

ds versions of the sequence wizard. Legacy siblings in `../` are untouched, so
`SequenceWizardPage` (legacy) → legacy components and `SequenceWizardPageV2` →
these; `PageSwitch` picks between the two whole trees.

## Two files are deliberately NOT migrated and are imported from `../`

**`wizardConstants.js`** — pure data and helpers (templates, defaults,
timezone/time options, `countPlaceholders`, `computeEmailDay`,
`getTemplateStats`). It carries no styling worth changing and is **also
imported by `components/SequenceDetailPage`**, so forking it would put the
sequence detail page and the wizard on two diverging copies of the automation
trigger list and the schedule defaults.

**`RichBodyEditor.jsx`** — the WYSIWYG email composer, and the important call in
this subsystem. Its surface is `bg-white text-gray-900`, and `.rich-body-editor`
in `index.css` renders it in **Arial/Helvetica 14px/1.6 with Gmail's link blue
`#1a73e8`**. That is not un-migrated legacy styling; it is a deliberate mirror
of how the email will look in the recipient's client. Re-theming it to ds —
Inter, a dark surface, brand-green links — would mean a writer styling text
against a background the recipient never sees.

It also carries two things no restyle should go near: the DOMPurify `sanitize`
with its `FORBID_TAGS`/`FORBID_ATTR` list, and the `isInternalChange` ref dance
that stops the caret jumping to position 0 on every keystroke.

Same principle as the email-template preview (phase 35), the signing document
surface (phase 26), and the careers pages (phase 32).
