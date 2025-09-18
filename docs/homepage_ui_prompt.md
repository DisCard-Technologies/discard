
# UI/UX Prompt: Discard Marketing Homepage

This prompt is based on the existing design system defined in `tailwind.config.ts`.

**1. Core Identity & Mood**

*   **Vibe:** Modern, minimalist, bold, and confident. The design should feel clean, approachable, and highly professional. It avoids typical dark-themed crypto aesthetics in favor of a bright, high-contrast, and memorable style.
*   **Theme:** Light Mode First. The design relies on a neutral light gray background, strong typography, and a vibrant accent color to create impact.
*   **Keywords:** Light-themed, Minimalist, High-Contrast, Bold Typography, Modern.

**2. Color Palette (from `tailwind.config.ts`)**

*   **Primary Background:** `#f1f1f1` (Light Gray) - This should be the main canvas color for the entire page.
*   **Primary Text & Elements:** `#212121` (Near Black) - Used for all headlines, body text, and primary UI elements to ensure maximum readability.
*   **Primary Accent:** `#cdea68` (Lime Green) - Used strategically for key CTAs, highlights, and interactive elements to draw user attention.
*   **Special Accent:** `#004d43` (Dark Green) - Reserved for a specific, high-impact branding element, such as a full-width marquee banner, as the name suggests.

**3. Typography (from `tailwind.config.ts`)**

*   **Headlines:** Use **FoundersGrotesk**. It should be large, bold, and have tight letter spacing. It's meant to be a core part of the visual identity.
*   **Body Text & UI Labels:** Use **NeueMontreal**. It should be used for all paragraphs, descriptions, and smaller labels, ensuring clarity and a clean reading experience.

---

### **4. Section-by-Section Breakdown**

**Section 1: Hero**

*   **Layout:** Full-screen, minimalist.
*   **Background:** The standard light gray (`#f1f1f1`).
*   **Headline:** Massive, screen-filling typography using **FoundersGrotesk**. The text should be the main visual. Example:
    *   Line 1: "PRIVACY."
    *   Line 2: "INSTANTLY."
*   **Sub-headline:** A simple, clean paragraph in **NeueMontreal** below the main headline.
*   **CTA:** A simple, underlined text link in **NeueMontreal**, not a button. On hover, the underline could animate or the text could change color to the lime green accent. Example: "Download the App ->"

**Section 2: Marquee Banner**

*   **Layout:** A full-width, continuously scrolling banner.
*   **Background:** Solid dark green (`#004d43`).
*   **Content:** White text using **NeueMontreal**, repeating a core message like "SPEND CRYPTO ANYWHERE • SECURE YOUR PAYMENTS • ABSOLUTE PRIVACY •"

**Section 3: Features**

*   **Layout:** A clean, two-column grid.
*   **Left Column:** A "sticky" headline that stays in place as the user scrolls through the features on the right. Headline: "The Future of Payments."
*   **Right Column:** A series of clean, borderless panels that scroll vertically. Each panel contains:
    *   A bold title in **FoundersGrotesk**.
    *   A short descriptive paragraph in **NeueMontreal**.
    *   A simple, line-art icon.
    *   A link to learn more, styled like the hero CTA.

**Section 4: "About" Section**

*   **Layout:** A full-width section with a distinct background color.
*   **Background:** Solid lime green (`#cdea68`).
*   **Content:** Centered, near-black (`#212121`) text.
    *   **Headline:** A thought-provoking question in **FoundersGrotesk**, e.g., "Ready to reclaim your financial privacy?"
    *   **Body:** A short mission statement in **NeueMontreal**.
    *   **CTA:** A large, pill-shaped button with a near-black background and lime-green text: **"Download Now"**. This is the primary conversion point.

**Section 5: Footer**

*   **Layout:** A simple, two-column layout on the standard light gray background.
*   **Left Column:** The Discard logo and a copyright notice.
*   **Right Column:** Simple text links for `Privacy Policy`, `Terms of Service`, and social media.
