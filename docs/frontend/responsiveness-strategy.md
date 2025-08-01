# Responsiveness Strategy

### Breakpoints

| Breakpoint | Min Width | Max Width | Target Devices |
|------------|-----------|-----------|----------------|
| Mobile | 320px | 767px | iPhone, Android phones |
| Tablet | 768px | 1023px | iPad, Android tablets |
| Desktop | 1024px | 1440px | Laptops, small desktops |
| Wide | 1441px | - | Large monitors, ultra-wide displays |

### Adaptation Patterns

**Layout Changes:** Mobile-first responsive design with card grid adapting from single column (mobile) to 2-3 columns (tablet) to 4+ columns (desktop). Navigation transforms from bottom tabs (mobile) to sidebar (desktop).

**Navigation Changes:** Bottom tab bar on mobile transitions to left sidebar on desktop. Card creation remains prominent through floating action button (mobile) or dedicated sidebar action (desktop).

**Content Priority:** Transaction details condensed on mobile with expandable sections, full detail panels on desktop. Privacy indicators remain prominent across all breakpoints.

**Interaction Changes:** Touch-optimized interactions on mobile (swipe gestures, large touch targets) with hover states and keyboard shortcuts on desktop. Card management adapts from swipe actions (mobile) to right-click context menus (desktop).
