import Nav from "@/components/nav"

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Help" }]} />

      <div className="max-w-3xl mx-auto py-12 px-6 space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">How AtVeAnimation Works</h1>
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
                body: "Choose from Pixar 3D, anime, comic book, or pencil sketch. AtVeAnimation generates four cartoon versions of you — pick the one that looks most like you. This image becomes the visual anchor for all your videos.",
              },
              {
                step: "3",
                title: "Train your character",
                body: "Your cartoon style image is used to train a personal AI model (LoRA) on Replicate. This takes 10–15 minutes. You can leave the page — training runs in the background and you'll see the status when you come back.",
              },
              {
                step: "4",
                title: "Record your voice (optional)",
                body: "Read 2–3 sentences aloud in a quiet room. The AI clones your voice and uses it to narrate your video scenes. Skip this step if you want silent videos.",
              },
              {
                step: "5",
                title: "Create a video",
                body: "Click Create Video from your character page. In the studio, write scene descriptions or use the Write with AI button to generate them from a simple brief. Add voice scripts for each scene if you recorded your voice.",
              },
              {
                step: "6",
                title: "Generate and stitch",
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
            <p><span className="font-medium text-zinc-800">Be specific and visual.</span> Instead of "the character is happy", write "the character sits at a sunlit café table, smiling and holding a coffee cup, a warm golden light streaming through the window".</p>
            <p><span className="font-medium text-zinc-800">Include the setting.</span> Where is the character? Time of day? Indoor or outdoor? The AI uses all of this to compose the scene.</p>
            <p><span className="font-medium text-zinc-800">Use the AI brief generator.</span> Click Write with AI in the studio and describe your video in plain language — "A 30-second upbeat video of my character waking up, making coffee, and heading out for a run." The AI expands this into detailed scene prompts.</p>
            <p><span className="font-medium text-zinc-800">Keep voice scripts short.</span> 1–2 sentences per scene work best for the voice cloning model. The script should feel natural when spoken aloud, not read.</p>
            <p><span className="font-medium text-zinc-800">Name your video first.</span> Set the video title before clicking Generate — you'll find it in the header bar of the studio page.</p>
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
                a: "Scene 1 is generated using your trained LoRA model — it's the most accurate representation of your character. Scenes 2+ reference scene 1 as the style anchor, so slight variation is normal but drift is minimised.",
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
                q: "How long does video generation take?",
                a: "Each scene takes 3–8 minutes: image generation (~30s), upscaling (~15s), video generation with WAN (~4–6 min), and enhancement to 1080p (~1–2 min). Audio is generated in parallel and usually finishes first.",
              },
              {
                q: "My audio failed for scene 1 — is that a bug?",
                a: "Scene 1 generates image, video, and audio all at the same time, which can briefly hit Replicate's rate limit. The system retries automatically. If it fails after retries, scene 1 will be silent but subsequent scenes should have audio.",
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
    </div>
  )
}
