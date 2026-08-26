import Nav from "@/components/nav"

import type { Metadata } from "next"
import SiteFooter from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Help",
  description: "Answers to common questions about characters, styles, videos, and voices.",
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />

      <div className="max-w-3xl mx-auto py-12 px-6 space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">How it works</h1>
          <p className="text-zinc-500 mt-2">
            Turn yourself into an animated cartoon character and create short videos with your cloned voice.
          </p>
        </div>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">
            Step-by-step workflow
          </h2>

          <div className="space-y-5">
            {[
              {
                step: "1",
                title: "Upload your selfie",
                body: "Use a clear, front-facing photo with good lighting. The cleaner the face, the better the cartoon. Avoid sunglasses, heavy shadows, or group photos.",
              },
              {
                step: "2",
                title: "Pick a cartoon style",
                body: "Choose from Pixar 3D, anime, comic book, or pencil sketch. We generate four cartoon versions of you — pick the one that looks most like you. This image becomes the visual anchor for all your videos.",
              },
              {
                step: "3",
                title: "Train your character",
                body: "Your cartoon style image is used to train a personal AI model that learns your character's look. This takes 10–15 minutes. You can leave the page — training runs in the background and you'll see the status when you come back.",
              },
              {
                step: "4",
                title: "Add your own voice (optional)",
                body: "Read 2–3 sentences aloud in a quiet room. The AI clones your voice and uses it to narrate your video scenes. Skip this step if you want silent videos.",
              },
              {
                step: "5",
                title: "Create a video",
                body: "Click Create Video from your character page. In the studio, write scene descriptions or use the Write with AI button to generate them from a simple brief. Add voice scripts for each scene if you recorded your voice.",
              },
              {
                step: "6",
                title: "Watch it come together",
                body: "Click Generate All Scenes to start generating. Each scene takes 3–8 minutes. When all scenes are ready, click Generate Final Video to stitch them together with audio.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">
                  {step}
                </div>
                <div>
                  <p className="font-semibold text-zinc-900">{title}</p>
                  <p className="text-zinc-500 text-sm mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">
            Tips for better scene descriptions
          </h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p><span className="font-medium text-zinc-800">Be specific and visual.</span> Instead of &ldquo;the character is happy&rdquo;, write &ldquo;the character sits at a sunlit café table, smiling and holding a coffee cup, a warm golden light streaming through the window&rdquo;.</p>
            <p><span className="font-medium text-zinc-800">Include the setting.</span> Where is the character? Time of day? Indoor or outdoor? The AI uses all of this to compose the scene.</p>
            <p><span className="font-medium text-zinc-800">Use the AI brief generator.</span> Click Write with AI in the studio and describe your video in plain language — &ldquo;A 30-second upbeat video of my character waking up, making coffee, and heading out for a run.&rdquo; The AI expands this into detailed scene prompts.</p>
            <p><span className="font-medium text-zinc-800">Keep voice scripts short.</span> 1–2 sentences per scene work best for the voice cloning model. The script should feel natural when spoken aloud, not read.</p>
            <p><span className="font-medium text-zinc-800">Name your video first.</span> Set the video title before clicking Generate — you&apos;ll find it in the header bar of the studio page.</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">
            Common questions
          </h2>
          <div className="space-y-5 text-sm">
            {[
              {
                q: "Why does scene 1 look different from the rest?",
                a: "Scene 1 is generated using your trained character model — it's the most accurate representation of your character. Scenes 2+ reference scene 1 as the style anchor, so slight variation is normal but drift is minimized.",
              },
              {
                q: "The background looks too realistic — what should I do?",
                a: "Add visual keywords to your scene description like 'illustrated cartoon background', 'painted animation style', or 'cel-shaded environment'. The more you describe the art style, the better the result.",
              },
              {
                q: "Can I reuse a character across multiple videos?",
                a: "Yes — go to your character page and click Create Video. Each video is a separate project but all share the same trained character model.",
              },
              {
                q: "How long does a video take?",
                a: "Long enough for a coffee break and a walk. Character training runs about twenty minutes the first time (once per character). After that, each scene takes a few minutes. You can leave the page and come back — everything keeps running in the background.",
              },
              {
                q: "Scene 1 audio didn't work — what happened?",
                a: "Scene 1 generates image, video, and audio all at the same time, so it occasionally needs a moment longer. The system retries automatically, and if audio still can't be added, the following scenes will have it.",
              },
            ].map(({ q, a }) => (
              <div key={q}>
                <p className="font-medium text-zinc-900">{q}</p>
                <p className="text-zinc-500 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  )
}
