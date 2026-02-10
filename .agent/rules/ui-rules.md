---
trigger: always_on
---

# UI Design System Rules

## Core Principles
- **Consistency**: Maintain uniform spacing, colors, and typography throughout
- **Accessibility**: Ensure WCAG 2.1 AA compliance minimum
- **Responsiveness**: Design works seamlessly across all screen sizes
- **Performance**: Optimize for fast loading and smooth interactions

## Color Palette

### Dark Mode (Grey/Blue Theme)
```
Background Primary:    #0f1419  (Main background - deep grey)
Background Secondary:  #1a1f2e  (Cards, containers - grey-blue)
Background Tertiary:   #252d3d  (Elevated elements - lighter grey-blue)
Background Hover:      #2d3548  (Hover states)

Border:                #394150  (Dividers, outlines - muted blue-grey)
Border Light:          #4a5568  (Focused borders)

Text Primary:          #e8eaed  (Main content - off white)
Text Secondary:        #a0a6b1  (Supporting text - muted grey)
Text Tertiary:         #6c7380  (Disabled, hints - darker grey)

Accent Primary:        #4a9eff  (Primary actions - bright blue)
Accent Hover:          #3d8ce7  (Hover state - deeper blue)
Accent Active:         #2e7ad3  (Active state)

Success:               #00d4aa  (Success states - cyan-green)
Warning:               #ffb020  (Warnings - amber)
Error:                 #ff4d4f  (Errors - red)
Info:                  #5b9fff  (Information - light blue)
```

### Light Mode (White/Black Theme)
```
Background Primary:    #ffffff  (Main background - pure white)
Background Secondary:  #fafafa  (Cards, containers - off white)
Background Tertiary:   #f5f5f5  (Elevated elements - light grey)
Background Hover:      #eeeeee  (Hover states)

Border:                #e0e0e0  (Dividers, outlines - light grey)
Border Dark:           #bdbdbd  (Focused borders)

Text Primary:          #0a0a0a  (Main content - near black)
Text Secondary:        #404040  (Supporting text - dark grey)
Text Tertiary:         #757575  (Disabled, hints - medium grey)

Accent Primary:        #1a73e8  (Primary actions - blue)
Accent Hover:          #1557b0  (Hover state - darker blue)
Accent Active:         #0d47a1  (Active state)

Success:               #00a67e  (Success states - green)
Warning:               #f57c00  (Warnings - orange)
Error:                 #d32f2f  (Errors - red)
Info:                  #0288d1  (Information - blue)
```

## Spacing System

Use an 8px base unit with the following scale:

```
xxxs:  2px    (Micro spacing)
xxs:   4px    (Tiny gaps)
xs:    8px    (Small spacing)
sm:    12px   (Compact spacing)
md:    16px   (Base spacing)
lg:    24px   (Comfortable spacing)
xl:    32px   (Large spacing)
2xl:   40px   (Extra large)
3xl:   48px   (Section spacing)
4xl:   64px   (Major sections)
5xl:   80px   (Hero spacing)
6xl:   96px   (Maximum spacing)
```

## Component Specifications

### Buttons

**Primary Button**
```
Padding: 16px (horizontal) × 12px (vertical)
Height: 40px (auto with padding)
Border Radius: 6px
Font: 500 weight, 14px
Margin Bottom: 16px (when stacked)
Margin Right: 12px (when inline)
Gap (icon + text): 8px
Min Width: 100px
```

**Secondary Button**
```
Padding: 16px (horizontal) × 12px (vertical)
Height: 40px
Border: 1px solid border color
Border Radius: 6px
Font: 500 weight, 14px
Margin Bottom: 16px (when stacked)
Margin Right: 12px (when inline)
```

**Small Button**
```
Padding: 12px (horizontal) × 8px (vertical)
Height: 32px
Border Radius: 4px
Font: 500 weight, 13px
Margin Bottom: 12px (when stacked)
Margin Right: 8px (when inline)
```

**Large Button**
```
Padding: 24px (horizontal) × 16px (vertical)
Height: 52px
Border Radius: 8px
Font: 500 weight, 16px
Margin Bottom: 20px (when stacked)
Margin Right: 16px (when inline)
```

### Cards

**Standard Card**
```
Padding: 24px (all sides)
Margin Bottom: 24px (when stacked)
Border Radius: 12px
Border: 1px solid border color
Gap (internal elements): 16px

Card Header:
  Padding Bottom: 16px
  Border Bottom: 1px solid border
  Margin Bottom: 16px

Card Footer:
  Padding Top: 16px
  Border Top: 1px solid border
  Margin Top: 16px
```

**Compact Card**
```
Padding: 16px (all sides)
Margin Bottom: 16px
Border Radius: 8px
Gap (internal elements): 12px
```

**Large Card**
```
Padding: 32px (all sides)
Margin Bottom: 32px
Border Radius: 16px
Gap (internal elements): 24px
```

### Input Fields

**Text Input**
```
Padding: 12px (horizontal) × 10px (vertical)
Height: 40px
Border: 1px solid border color
Border Radius: 6px
Font: 400 weight, 14px
Margin Bottom: 20px

Label:
  Margin Bottom: 8px
  Font: 500 weight, 13px
  
Helper Text:
  Margin Top: 6px
  Font: 400 weight, 12px
  
Error Message:
  Margin Top: 6px
  Font: 500 weight, 12px
```

**Textarea**
```
Padding: 12px (all sides)
Min Height: 120px
Border: 1px solid border color
Border Radius: 6px
Font: 400 weight, 14px
Margin Bottom: 20px
```

**Select Dropdown**
```
Padding: 12px (horizontal) × 10px (vertical)
Padding Right: 36px (for icon)
Height: 40px
Border: 1px solid border color
Border Radius: 6px
Margin Bottom: 20px
```

**Checkbox / Radio**
```
Size: 20px × 20px
Margin Right: 12px (label spacing)
Margin Bottom: 16px (when stacked)
Border: 2px solid border color
Border Radius: 4px (checkbox), 50% (radio)
```

### Navigation

**Top Navigation Bar**
```
Height: 64px
Padding: 0 32px (desktop)
Padding: 0 16px (mobile)
Border Bottom: 1px solid border color
Background: Background Secondary (with backdrop blur)

Nav Items:
  Padding: 20px 16px
  Margin: 0 4px
  Gap: 12px (icon + text)
  Border Radius: 6px (for active/hover)
```

**Sidebar Navigation**
```
Width: 280px (expanded), 72px (collapsed)
Padding: 24px 16px

Nav Items:
  Padding: 12px 16px
  Margin Bottom: 4px
  Border Radius: 8px
  Gap: 12px (icon + text)
  
Nav Sections:
  Margin Bottom: 24px
  
Section Headers:
  Padding: 8px 16px
  Margin Bottom: 8px
  Font: 600 weight, 11px, uppercase
```

**Breadcrumbs**
```
Padding: 16px 0
Margin Bottom: 24px
Gap: 8px (between items)

Breadcrumb Items:
  Padding: 6px 12px
  Border Radius: 4px
  Font: 400 weight, 14px
```

### Lists

**Standard List**
```
List Item:
  Padding: 16px 20px
  Border Bottom: 1px solid border
  Gap: 12px (between elements)
  
List Header:
  Padding: 12px 20px
  Background: Background Tertiary
  Font: 600 weight, 13px
  Border Bottom: 1px solid border
```

**Compact List**
```
List Item:
  Padding: 12px 16px
  Border Bottom: 1px solid border
  Gap: 8px
```

### Modals & Dialogs

**Modal**
```
Width: 560px (default), 90vw (mobile max)
Max Width: 90vw
Padding: 32px
Border Radius: 16px
Margin: auto (centered)

Modal Header:
  Padding Bottom: 24px
  Margin Bottom: 24px
  Border Bottom: 1px solid border
  
Modal Footer:
  Padding Top: 24px
  Margin Top: 24px
  Border Top: 1px solid border
  Gap: 12px (between buttons)
  
Modal Body:
  Padding: 0
  Gap: 20px (between sections)
```

**Dialog (Confirm/Alert)**
```
Width: 420px (default)
Padding: 28px
Border Radius: 12px
Gap: 20px (between elements)
```

### Tables

**Table**
```
Table:
  Border: 1px solid border color
  Border Radius: 12px
  Margin Bottom: 32px
  
Table Header:
  Background: Background Tertiary
  Border Bottom: 2px solid border
  
TH:
  Padding: 16px 20px
  Font: 600 weight, 13px
  Text Align: left
  
TD:
  Padding: 16px 20px
  Font: 400 weight, 14px
  Border Bottom: 1px solid border
  
TR:hover:
  Background: Background Hover
  
Table Footer:
  Padding: 16px 20px
  Border Top: 2px solid border
```

### Tags / Badges

**Tag**
```
Padding: 6px 12px
Height: 28px
Border Radius: 14px (pill shape)
Font: 500 weight, 12px
Margin Right: 8px
Margin Bottom: 8px
Gap: 6px (icon + text)
```

**Badge (Notification)**
```
Size: 20px × 20px (circular)
Padding: 4px (if text)
Font: 600 weight, 11px
Border: 2px solid background color
```

### Tooltips

**Tooltip**
```
Padding: 8px 12px
Max Width: 240px
Border Radius: 6px
Font: 400 weight, 13px
Margin: 8px (distance from trigger)
```

### Forms

**Form Container**
```
Padding: 32px
Background: Background Secondary
Border Radius: 12px
Margin Bottom: 32px
Gap: 24px (between form sections)
```

**Form Section**
```
Margin Bottom: 32px

Section Title:
  Margin Bottom: 16px
  Font: 600 weight, 18px
  
Section Description:
  Margin Bottom: 24px
  Font: 400 weight, 14px
  Color: Text Secondary
```

**Form Row**
```
Margin Bottom: 20px
Gap: 16px (between columns)

Two Column Layout:
  Column Padding: 0 8px
  Gap: 16px
```

### Typography

**Headings**
```
H1:
  Font: 700 weight, 36px
  Line Height: 1.2
  Margin Bottom: 24px
  
H2:
  Font: 600 weight, 28px
  Line Height: 1.3
  Margin Bottom: 20px
  
H3:
  Font: 600 weight, 22px
  Line Height: 1.4
  Margin Bottom: 16px
  
H4:
  Font: 600 weight, 18px
  Line Height: 1.4
  Margin Bottom: 12px
  
H5:
  Font: 600 weight, 16px
  Line Height: 1.5
  Margin Bottom: 12px
  
H6:
  Font: 600 weight, 14px
  Line Height: 1.5
  Margin Bottom: 8px
```

**Body Text**
```
Paragraph:
  Font: 400 weight, 14px
  Line Height: 1.6
  Margin Bottom: 16px
  
Large Text:
  Font: 400 weight, 16px
  Line Height: 1.6
  Margin Bottom: 16px
  
Small Text:
  Font: 400 weight, 12px
  Line Height: 1.5
  Margin Bottom: 12px
```

### Sections & Containers

**Page Container**
```
Max Width: 1280px
Padding: 32px (desktop)
Padding: 16px (mobile)
Margin: 0 auto
```

**Section**
```
Padding: 64px 0 (desktop)
Padding: 40px 0 (mobile)
Margin Bottom: 0

Section Header:
  Margin Bottom: 40px (desktop)
  Margin Bottom: 24px (mobile)
```

**Grid Container**
```
Gap: 24px (desktop)
Gap: 16px (mobile)
Padding: 0

Grid Item:
  Padding: 0
  Min Height: based on content
```

## Layout Grid System

**12-Column Grid**
```
Container Padding: 32px (desktop), 16px (mobile)
Column Gap: 24px (desktop), 16px (mobile)
Row Gap: 32px (desktop), 24px (mobile)

Column Widths:
  1 col:  calc((100% - 11 × 24px) / 12)
  2 col:  calc((100% - 10 × 24px) / 12 × 2 + 24px)
  ... and so on
```

## Responsive Breakpoints

```
xs:  0px     (Mobile portrait)
sm:  640px   (Mobile landscape)
md:  768px   (Tablet)
lg:  1024px  (Desktop)
xl:  1280px  (Large desktop)
2xl: 1536px  (Wide screens)
```

**Spacing Adjustments by Breakpoint**
```
Mobile (< 640px):
  - Reduce all padding by 25-50%
  - Use vertical stacking
  - Minimum touch target: 44px
  
Tablet (640px - 1024px):
  - Standard spacing
  - 2-column layouts where appropriate
  
Desktop (> 1024px):
  - Full spacing system
  - Multi-column layouts
  - Larger margins for readability
```

## Border Radius

```
xs:   2px   (Tiny elements)
sm:   4px   (Small elements, inputs)
md:   6px   (Buttons, cards)
lg:   8px   (Larger cards)
xl:   12px  (Modals, major cards)
2xl:  16px  (Hero sections)
3xl:  24px  (Extra large elements)
full: 9999px (Pills, circular elements)
```

## Shadows

```
sm:   0 1px 2px rgba(0, 0, 0, 0.06)
md:   0 2px 4px rgba(0, 0, 0, 0.08)
lg:   0 4px 8px rgba(0, 0, 0, 0.10)
xl:   0 8px 16px rgba(0, 0, 0, 0.12)
2xl:  0 16px 32px rgba(0, 0, 0, 0.15)

Light Mode Adjustments:
  - Use lighter shadows: rgba(0, 0, 0, 0.04) to rgba(0, 0, 0, 0.10)
```

## Animation & Transitions

```
Duration Fast:     150ms
Duration Base:     200ms
Duration Slow:     300ms
Duration Slower:   400ms

Easing:
  ease-out: cubic-bezier(0, 0, 0.2, 1)
  ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
```

## Z-Index Scale

```
dropdown:   1000
sticky:     1020
fixed:      1030
modal-backdrop: 1040
modal:      1050
popover:    1060
tooltip:    1070
notification: 1080
```

## Accessibility Requirements

- Minimum text contrast: 4.5:1 (normal), 3:1 (large text 18px+)
- Focus visible: 2px solid accent color, 2px offset
- Touch targets: minimum 44px × 44px
- Skip links: visible on focus
- ARIA labels: all interactive elements
- Keyboard navigation: full support

---

**Version**: 2.0  
**Last Updated**: January 2026  
**Color Scheme**: Dark Mode (Grey/Blue) | Light Mode (White/Black)