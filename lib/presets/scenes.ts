export type FocusRole = "primary" | "secondary" | "shared" | "any"

export interface PresetScene {
  id: string
  title: string
  description: string
  voiceScript: string
  durationSeconds: 5 | 10 | 15
  tags: string[]
  // "primary" = best for the main character LoRA, "shared" = good for multi-char composite
  focusRole: FocusRole
}

export const PRESET_SCENES: PresetScene[] = [
  // ── Everyday moments ──────────────────────────────────────────────────────
  {
    id: "morning-coffee",
    title: "Morning Coffee",
    description: "The character sits at a cozy kitchen table, steam rising from a coffee mug, morning sunlight streaming through a window.",
    voiceScript: "Good morning! Nothing beats the first sip of coffee to start the day.",
    durationSeconds: 5,
    tags: ["everyday", "cozy", "morning"],
    focusRole: "primary",
  },
  {
    id: "city-walk",
    title: "City Stroll",
    description: "The character walks down a vibrant animated city street, colorful storefronts and animated pedestrians in the background.",
    voiceScript: "I love exploring the city — every block has something new to discover.",
    durationSeconds: 10,
    tags: ["urban", "adventure", "everyday"],
    focusRole: "primary",
  },
  {
    id: "park-bench",
    title: "Park Bench",
    description: "The character sits on a park bench surrounded by animated trees and a peaceful pond, birds flitting by.",
    voiceScript: "Sometimes the best moments are the quiet ones.",
    durationSeconds: 5,
    tags: ["nature", "calm", "everyday"],
    focusRole: "primary",
  },
  {
    id: "cooking-scene",
    title: "Cooking Up a Storm",
    description: "The character stirs a colorful pot in a bright illustrated kitchen, cartoon steam and delicious smells filling the air.",
    voiceScript: "The secret ingredient? A little love in every stir.",
    durationSeconds: 10,
    tags: ["cooking", "home", "fun"],
    focusRole: "primary",
  },

  // ── Celebration & milestones ──────────────────────────────────────────────
  {
    id: "birthday-party",
    title: "Birthday Celebration",
    description: "Colorful balloons and confetti fill an animated party room, a birthday cake glowing with candles in the foreground.",
    voiceScript: "Make a wish — this one is going to be your best year yet!",
    durationSeconds: 10,
    tags: ["celebration", "birthday", "family"],
    focusRole: "shared",
  },
  {
    id: "graduation-walk",
    title: "Graduation Day",
    description: "The character walks across a stage in cap and gown, confetti raining down and a cheering animated crowd in the background.",
    voiceScript: "All that hard work — and this is just the beginning.",
    durationSeconds: 10,
    tags: ["milestone", "graduation", "achievement"],
    focusRole: "primary",
  },
  {
    id: "wedding-toast",
    title: "Wedding Toast",
    description: "Two characters stand together holding champagne flutes, an elegant illustrated reception hall glittering behind them.",
    voiceScript: "Here's to the adventures that lie ahead — together.",
    durationSeconds: 10,
    tags: ["wedding", "romance", "milestone"],
    focusRole: "shared",
  },
  {
    id: "new-year",
    title: "New Year Countdown",
    description: "A joyful animated street scene with fireworks bursting overhead as the new year ticks in.",
    voiceScript: "New year, new chapter — let's make it unforgettable.",
    durationSeconds: 10,
    tags: ["celebration", "new year", "festive"],
    focusRole: "shared",
  },

  // ── Action & adventure ────────────────────────────────────────────────────
  {
    id: "mountain-summit",
    title: "Summit Reached",
    description: "The character stands triumphantly at a mountain peak, vast illustrated valleys stretching below under a dramatic sky.",
    voiceScript: "The view from the top makes every step worth it.",
    durationSeconds: 10,
    tags: ["adventure", "triumph", "nature"],
    focusRole: "primary",
  },
  {
    id: "space-launch",
    title: "Rocket Launch",
    description: "The character sits inside a cartoon rocket cockpit as it blasts off, stars and planets whizzing by in a colorful animated space.",
    voiceScript: "Three, two, one — to infinity and beyond!",
    durationSeconds: 15,
    tags: ["space", "adventure", "fantasy"],
    focusRole: "primary",
  },
  {
    id: "superhero-landing",
    title: "Hero's Landing",
    description: "The character lands dramatically in a superhero pose on an animated city rooftop, cape fluttering in the wind.",
    voiceScript: "The city never sleeps — and neither does its hero.",
    durationSeconds: 5,
    tags: ["action", "superhero", "fantasy"],
    focusRole: "primary",
  },
  {
    id: "ocean-dive",
    title: "Underwater Adventure",
    description: "The character dives into a vibrant animated ocean, colorful fish and glowing coral swirling around them.",
    voiceScript: "There's a whole world hiding beneath the surface.",
    durationSeconds: 10,
    tags: ["adventure", "nature", "underwater"],
    focusRole: "primary",
  },

  // ── Emotional / heartfelt ─────────────────────────────────────────────────
  {
    id: "family-hug",
    title: "Family Embrace",
    description: "Two or more characters share a warm animated hug in a cozy living room, soft golden light surrounding them.",
    voiceScript: "Family isn't just who you're born with — it's who you choose to hold close.",
    durationSeconds: 5,
    tags: ["family", "heartfelt", "love"],
    focusRole: "shared",
  },
  {
    id: "stargazing",
    title: "Stargazing Night",
    description: "The character lies on a hill under a vast illustrated night sky, shooting stars streaking overhead.",
    voiceScript: "Out here, every star feels like a wish waiting to come true.",
    durationSeconds: 10,
    tags: ["nature", "calm", "wonder"],
    focusRole: "any",
  },
  {
    id: "friendship-high-five",
    title: "Best Friend Moment",
    description: "Two characters share a high-five and burst into laughter in a bright animated setting, joy radiating from the scene.",
    voiceScript: "Every great adventure is better with your best friend by your side.",
    durationSeconds: 5,
    tags: ["friendship", "fun", "heartfelt"],
    focusRole: "shared",
  },
  {
    id: "reading-nook",
    title: "Reading Nook",
    description: "The character curls up in a cozy illustrated armchair with a book, a warm lamp casting soft light around them.",
    voiceScript: "The best journeys start with the first page.",
    durationSeconds: 5,
    tags: ["cozy", "calm", "everyday"],
    focusRole: "primary",
  },

  // ── Travel & exploration ──────────────────────────────────────────────────
  {
    id: "travel-montage",
    title: "Passport Adventures",
    description: "The character poses in front of a sequence of illustrated global landmarks — Eiffel Tower, pyramids, and more.",
    voiceScript: "The world is too big to stay in one place.",
    durationSeconds: 15,
    tags: ["travel", "adventure", "world"],
    focusRole: "primary",
  },
  {
    id: "beach-sunset",
    title: "Sunset on the Beach",
    description: "The character watches an animated sunset over a cartoon ocean, warm pink and orange hues painting the sky.",
    voiceScript: "Every sunset is a reminder to cherish the day that was.",
    durationSeconds: 10,
    tags: ["nature", "calm", "travel"],
    focusRole: "any",
  },
  {
    id: "road-trip",
    title: "Road Trip",
    description: "Characters ride in a cartoon convertible down a scenic illustrated highway, wind in their hair and open road ahead.",
    voiceScript: "The destination matters — but the drive is half the fun.",
    durationSeconds: 10,
    tags: ["travel", "adventure", "fun"],
    focusRole: "shared",
  },
  {
    id: "forest-walk",
    title: "Enchanted Forest",
    description: "The character walks through a magical animated forest, fireflies twinkling and giant trees arching overhead.",
    voiceScript: "Sometimes the most enchanted places are just outside your door.",
    durationSeconds: 10,
    tags: ["nature", "wonder", "adventure"],
    focusRole: "primary",
  },
]

export function getPresetById(id: string): PresetScene | undefined {
  return PRESET_SCENES.find((s) => s.id === id)
}

export function getPresetsByTag(tag: string): PresetScene[] {
  return PRESET_SCENES.filter((s) => s.tags.includes(tag))
}

export function getPresetsByFocusRole(role: FocusRole): PresetScene[] {
  return PRESET_SCENES.filter((s) => s.focusRole === role || s.focusRole === "any")
}
