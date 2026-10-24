# DSH unified corner-radius standard

English | [中文](ui-radius.zh.md)

## Summary

Choose consistent corner radii by component role and size, and align nested regions, hover fills, backgrounds, and strokes. This standard covers buttons, cells, cards, menus, dialogs, and avatars in DSH Web and Desktop.

## Table of Contents

- [Scope and authority](#scope)
- [Select the radius](#radius-scale)
- [Reuse tokens and preserve deliberate shapes](#shapes)
- [Nested geometry and hover](#nested-hover)
- [Settings card materials](#settings-cards)
- [Apply and verify](#verification)

<a id="scope"></a>
## Scope and authority

This reference defines the DSH Web and Desktop radius scale and its component rules. A local visual adjustment stays scoped to the named component or family and does not automatically change the global scale.

The [Web UI style reference](web-styling.md) defines general styling ownership. Shared values live in [`base.css`](../packages/client/ui-theme/src/styles/base.css), and curve behavior lives in [`corner-shape.css`](../packages/client/ui-theme/src/styles/corner-shape.css). Update the theme implementation and both language versions of this standard together when changing a rule.

<a id="radius-scale"></a>
## Select the radius

H means designed outer height in CSS pixels, including borders. R means CSS `border-radius`, before the browser clamps overlapping corners. Choose the component role first, then its size variant; width, label length, incidental wrapping, and content expansion do not independently select a larger radius.

| Role | Typical dimensions or examples | Radius | Shared token |
|---|---|---|---|
| Small detail | Keycaps, checkbox marks and tiny controls | R6 | `--dsw-radius-xs` |
| Compact inset | Small rows, code surfaces and inline controls | R12 | `--dsw-radius-sm` |
| Field or nested editor | Standard form fields and inset content | R16 | `--dsw-radius-md` |
| Independent panel | Cards, popovers and dialogs | R20 | `--dsw-radius-lg`, `--dsw-radius-xl`, `--dsw-radius-panel` |
| Main action | H44 labeled actions, icon actions and navigation rails | Capsule or circle | `--dsw-control-radius` |

`Button` uses H44 for `md` and uses H36 for compact actions, expanding to H44 on coarse pointers. Labeled actions are capsules; icon-only actions are circles. Standard form fields use H44/R16. Segmented controls use H36 and tabs H44 with one shared glass layer and a plain selected indicator. Cards, dialogs and reading panels remain opaque; glass is reserved for operation surfaces.

Code, preview and delivered-file cards keep their existing semantic radius tokens; the theme now resolves them to the product scale. Existing miniature drawings and explicitly recorded package geometry remain deliberate exceptions. Runtime content and document previews retain their established behavior.


<a id="shapes"></a>
## Reuse tokens and preserve deliberate shapes

Reuse `ui-primitives` controls before adding feature-owned geometry. Use `box-sizing: border-box` for fixed outer dimensions. Filled, outline, ghost, loading, and disabled variants keep the same size and radius; hover, pressed, selected, and focus states do not change the radius.

Consume the named tokens instead of introducing local values such as 10px, 14px, 18px, or 24px for ordinary controls and cards. Schedule controls, Desktop onboarding, account notices, and shortcut controls retain their package-owned geometry; the [radius exception record](../packages/client/ui-theme/tests/expected/radius-exceptions.expected.json) pins each permitted file, selector, and declaration rather than exempting whole packages. A family-specific property may refer to a shared token, as `--dsl-guide-entry-radius` does. Geometry derived from a real inset may use `calc()`; it is not an additional scale tier.

Ordinary rounded surfaces use the theme's `superellipse(1.5)` curve where supported. `corner-shape` is not inherited: the theme applies it to elements and their `::before`/`::after`. Unsupported engines retain ordinary circular corners. Do not introduce component-specific smoothing that makes a fill and its outline curve differently.

Preserve intentional circles and capsules: avatars and status dots use `50%`; explicit pills and full-round tracks may use `999px`. Pair every such full-round declaration with `corner-shape: round` in the same rule. Ordinary action buttons follow the capsule language; embedded miniature controls retain their explicit component geometry. Tiny drawing details, such as glyph marks or miniature tracks, may retain their established local geometry; they do not justify arbitrary radii on surrounding controls.

Both the avatar container and its `img` must remain circular; an image that inherits only `border-radius` still needs an explicit `corner-shape: round` or must inherit the curve from its circular container. Keep equal width and height on both. See [Account settings](../packages/client/ui-settings-account/README.md#use-this-package) for account avatar sizes.

Edge-to-edge docked surfaces and adjoining cells may use R0 on shared edges. A header, footer, or image flush with a card rounds only its exposed outer corners; preserve square internal joins rather than rounding every child on all four sides.

<a id="nested-hover"></a>
## Nested geometry and hover

Distinguish these three arrangements before changing a child radius:

| Arrangement | Rule | Example |
|---|---|---|
| Circular concentric inset | Inner R = max(0, outer R − inset); both arcs share a center and use `round` | Outer R16, inset 4, inner R12 |
| Fill flush against an enclosing edge | The enclosure owns the visible corner; clip the fill or inherit the matching corner | A split-button card with two independent hover regions |
| Separate card or form group inside another surface | Choose the child's semantic tier; do not subtract all parent padding mechanically | R16 editor within an R20 settings card |

Standard menus use outer R20, 4px padding, and R16 items, including command selection, task menus, and the exposed highlights in subagent and background-job menus. Tree disclosure gutters retain their indentation; controls inside a filled job row keep their own compact geometry. Compact menus use outer R16, 4px padding, and R12 items. Shared `SegmentedControl` and `SegmentedTabs` use capsule containers, 4px inset and capsule segments and indicators. Keep indicator offsets, width calculations, submenu alignment, and pointer bridges consistent when changing padding.

The radius subtraction is also the nominal sizing rule for nested superellipses. Equal exponents do not make them exact offset curves, so their diagonal gap may differ from the side inset. Keep the shared superellipse menu and segmented-control treatments; use circular arcs when strict equal radial spacing is required.

A single clickable surface paints hover on itself. A flush pseudo-element or overlay uses the same radius and curve as the visible enclosure. Avoid a separately rounded fill that leaves a crescent between the background and the border.

For a split guide card, put the shared radius and clipping on the outer card; give the flush inner buttons square corners. Each button may keep its own hover color, while the outer card clips both fills to one contour. Keep dropdown menus outside the clipped subtree through the existing portal. Preserve a visible keyboard focus treatment rather than clipping an external focus ring away.

```css
.entry {
  border-radius: var(--dsl-guide-entry-radius);
  overflow: hidden;
}

.main,
.trigger {
  border-radius: 0;
}
```

The enclosing guide sets `--dsl-guide-entry-radius: var(--dsw-radius-xl)`. Do not give the inner buttons their own R28 ends while the outer card is R20.

<a id="settings-cards"></a>
## Settings card materials

Account profile, balance, model-provider, preset, and plugin cards share this default material. Selected, warning, error, and expanded states may use their existing semantic colors while retaining the geometry.

```css
.card {
  border-radius: var(--dsw-radius-xl);
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
}
```

The theme resolves the card fill to `--dsw-alias-bg-layer-2` and the stroke to `--dsw-alias-border-l4` on `body`, where palette aliases exist. Feature styles consume these aliases in both palettes. Nested editors use R16 and the existing module fill. Account usage/top-up links follow the shared H44 capsule Button geometry; authorization buttons use the shared Button.

Flat neutral borders use the shared 0.5px hairline. Elevated menus, popovers, dialogs, and panels use `border: 0` with the existing `--dsw-elevation-*` material, whose shadow includes the hairline. Do not add a second neutral border over that stroke or add a shadow to an ordinary settings card merely to distinguish its tab. Preserve semantic state-colored borders and the existing translucent-menu backdrop behavior.

<a id="verification"></a>
## Apply and verify

1. Inspect the requested components together with their shared primitives, overlays, pseudo-elements, and sibling variants. Classify roles before replacing values; do not map every occurrence of one old radius to the same new token.
2. Change the shared owner where appropriate, then align dependent fills, child corners, clipping, and state styles. Keep independent child cards on their own tier.
3. Compare actual rendered outer size, radius, curve, fill, and stroke in light and dark themes. Inspect normal, hover, pressed/selected, disabled, and keyboard-focus states where applicable; for split buttons, hover both halves. Check a narrow layout and longer labels when they can affect the component.
4. Use the existing radius, corner-shape, and elevation stylesheet guards and the smallest relevant browser scenario. The radius guard rejects off-scale literals and unknown tokens; it cannot determine whether a valid token is appropriate for a component or whether two rendered contours align. Confirm those visually.
5. Follow repository validation and documentation requirements for the actual diff. Update affected expectations only after confirming the intended appearance. Report the resulting rule, tested surfaces, and any unverified states; do not add tests that merely repeat CSS values for a trivial local adjustment.
